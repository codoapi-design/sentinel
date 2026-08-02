/**
 * Radareum AI — LLM Provider Layer
 *
 * Provider-agnostic chat-completion contract plus an OpenAI-compatible
 * implementation built on plain `fetch` (no SDK, no extra dependencies).
 *
 * The application ships without an LLM key. When no key is configured,
 * `getLlmProvider()` resolves to `NullProvider` and the caller falls back to
 * the deterministic narrative renderer (see `./render`). Setting the env vars
 * below enables the LLM path with no code change.
 *
 *   OPENAI_API_KEY     required — enables the LLM path
 *   OPENAI_BASE_URL    optional — defaults to https://api.openai.com/v1
 *   AI_MODEL           optional — daily analysis/chat; defaults to gpt-4o-mini
 *   AI_MODEL_REPORT    optional — full executive reports; defaults to gpt-4o
 *   AI_TIMEOUT_MS      optional — defaults to 30000
 */

export type ChatRole = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Raw JSON string exactly as returned by the model. Parse defensively. */
  arguments: string;
}

export interface LlmRequest {
  messages: ChatMessage[];
  tools?: LlmToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Prefer JSON object responses when the gateway supports OpenAI response_format. */
  responseFormat?: 'json_object' | 'text';
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  text: string;
  toolCalls?: LlmToolCall[];
  usage?: LlmUsage;
  model?: string;
  finishReason?: string;
}

export interface LlmProvider {
  readonly id: string;
  isConfigured(): boolean;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export type LlmErrorCode =
  | 'not_configured'
  | 'invalid_request'
  | 'auth'
  | 'rate_limited'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'bad_response';

const RETRYABLE_CODES: ReadonlySet<LlmErrorCode> = new Set<LlmErrorCode>([
  'rate_limited',
  'server_error',
  'network',
  'timeout',
]);

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: LlmErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
  }
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Which model lane to use for a request. */
export type LlmModelPurpose = 'default' | 'report';

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Report-lane model (executive / full intelligence reports). */
  reportModel: string;
  timeoutMs: number;
}

type EnvSource = Record<string, string | undefined>;

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_REPORT_MODEL = 'gpt-4o';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TEMPERATURE = 0.2;
const MAX_ERROR_BODY_CHARS = 500;

function readEnv(env: EnvSource, name: string): string {
  const raw = env[name];
  return typeof raw === 'string' ? raw.trim() : '';
}

function currentEnv(): EnvSource {
  return (typeof process === 'undefined' ? {} : process.env) as EnvSource;
}

/** Resolves LLM configuration from the environment. Never throws. */
export function resolveLlmConfig(env: EnvSource = currentEnv()): LlmConfig {
  const baseUrl = readEnv(env, 'OPENAI_BASE_URL') || DEFAULT_BASE_URL;
  const timeoutRaw = Number.parseInt(readEnv(env, 'AI_TIMEOUT_MS'), 10);
  const defaultModel = readEnv(env, 'AI_MODEL') || DEFAULT_MODEL;

  return {
    apiKey: readEnv(env, 'OPENAI_API_KEY'),
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model: defaultModel,
    reportModel: readEnv(env, 'AI_MODEL_REPORT') || DEFAULT_REPORT_MODEL,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Returns a config copy that uses the report model when `purpose === 'report'`.
 * Daily analysis/chat keep the cheaper default model.
 */
export function resolveLlmConfigForPurpose(
  purpose: LlmModelPurpose = 'default',
  env: EnvSource = currentEnv()
): LlmConfig {
  const base = resolveLlmConfig(env);
  if (purpose !== 'report') return base;
  return { ...base, model: base.reportModel };
}

/** Non-sensitive view of the active configuration, safe to log or surface. */
export function describeLlmConfig(config: LlmConfig = resolveLlmConfig()): {
  configured: boolean;
  baseUrl: string;
  model: string;
  reportModel: string;
  timeoutMs: number;
} {
  return {
    configured: config.apiKey.length > 0,
    baseUrl: config.baseUrl,
    model: config.model,
    reportModel: config.reportModel,
    timeoutMs: config.timeoutMs,
  };
}

// ---------------------------------------------------------------------------
// Secret hygiene
// ---------------------------------------------------------------------------

const SECRET_LIKE = /\b(?:sk|rk|api)[-_][A-Za-z0-9_-]{8,}/g;

/**
 * Strips the configured key and any key-shaped token from a string before it
 * reaches a log, an error message, or an API response.
 */
export function redactSecrets(text: string, secret?: string): string {
  let output = text;
  if (secret && secret.length >= 8) {
    output = output.split(secret).join('[redacted]');
  }
  return output.replace(SECRET_LIKE, '[redacted]');
}

// ---------------------------------------------------------------------------
// Wire format helpers (OpenAI Chat Completions)
// ---------------------------------------------------------------------------

interface WireMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
}

/**
 * `developer` is collapsed to `system` on the wire: it is understood by recent
 * OpenAI models but not by every OpenAI-compatible gateway, and the layering
 * that matters is preserved by message order.
 */
function toWireMessage(message: ChatMessage): WireMessage {
  const wire: WireMessage = {
    role: message.role === 'developer' ? 'system' : message.role,
    content: message.content,
  };
  if (message.name) wire.name = message.name;
  if (message.tool_call_id) wire.tool_call_id = message.tool_call_id;
  return wire;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function extractToolCalls(raw: unknown): LlmToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const calls: LlmToolCall[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const name = record.function?.name;
    if (typeof name !== 'string' || name.length === 0) continue;
    calls.push({
      id: typeof record.id === 'string' ? record.id : name,
      name,
      arguments: typeof record.function?.arguments === 'string' ? record.function.arguments : '{}',
    });
  }

  return calls.length > 0 ? calls : undefined;
}

function extractUsage(raw: unknown): LlmUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const usage = raw as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
  const prompt = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completion = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
  const total = typeof usage.total_tokens === 'number' ? usage.total_tokens : prompt + completion;
  if (prompt === 0 && completion === 0 && total === 0) return undefined;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

function statusToCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'invalid_request';
}

function isAbortError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { name?: string }).name === 'AbortError';
}

/**
 * Links an optional caller signal to an internal timeout controller.
 * Returns the composite signal plus a disposer that clears the timer.
 */
function withTimeout(
  timeoutMs: number,
  callerSignal?: AbortSignal
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id = 'openai-compatible';

  private readonly config: LlmConfig;

  constructor(config: LlmConfig = resolveLlmConfig()) {
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config.apiKey.length > 0 && this.config.baseUrl.length > 0;
  }

  get model(): string {
    return this.config.model;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.isConfigured()) {
      throw new LlmError('not_configured', 'No LLM API key is configured.');
    }
    if (!req.messages || req.messages.length === 0) {
      throw new LlmError('invalid_request', 'At least one message is required.');
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: req.messages.map(toWireMessage),
      temperature: req.temperature ?? DEFAULT_TEMPERATURE,
    };

    if (typeof req.maxTokens === 'number' && req.maxTokens > 0) {
      body.max_tokens = req.maxTokens;
    }
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      body.tool_choice = 'auto';
    }
    if (req.responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const timeout = withTimeout(this.config.timeoutMs, req.signal);

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: timeout.signal,
      });
    } catch (error) {
      if (timeout.timedOut()) {
        throw new LlmError('timeout', `LLM request timed out after ${this.config.timeoutMs}ms.`);
      }
      if (isAbortError(error) || req.signal?.aborted) {
        throw new LlmError('aborted', 'LLM request was aborted by the caller.');
      }
      throw new LlmError('network', this.safeMessage(error, 'LLM request failed.'));
    } finally {
      timeout.dispose();
    }

    if (!response.ok) {
      const detail = await this.readErrorBody(response);
      throw new LlmError(
        statusToCode(response.status),
        `LLM request failed with status ${response.status}${detail ? `: ${detail}` : '.'}`,
        { status: response.status }
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new LlmError('bad_response', 'LLM response was not valid JSON.');
    }

    const choice = (payload as { choices?: unknown[] })?.choices?.[0] as
      | { message?: { content?: unknown; tool_calls?: unknown }; finish_reason?: unknown }
      | undefined;

    if (!choice?.message) {
      throw new LlmError('bad_response', 'LLM response contained no completion.');
    }

    const text = extractText(choice.message.content).trim();
    const toolCalls = extractToolCalls(choice.message.tool_calls);

    if (text.length === 0 && !toolCalls) {
      throw new LlmError('bad_response', 'LLM returned an empty completion.');
    }

    return {
      text,
      toolCalls,
      usage: extractUsage((payload as { usage?: unknown }).usage),
      model: typeof (payload as { model?: unknown }).model === 'string'
        ? (payload as { model: string }).model
        : this.config.model,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
    };
  }

  private async readErrorBody(response: Response): Promise<string> {
    try {
      const raw = await response.text();
      if (!raw) return '';
      return redactSecrets(raw.slice(0, MAX_ERROR_BODY_CHARS), this.config.apiKey);
    } catch {
      return '';
    }
  }

  private safeMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : '';
    return message ? redactSecrets(message, this.config.apiKey) : fallback;
  }
}

/** Stand-in used whenever no key is configured. Always reports unconfigured. */
export class NullProvider implements LlmProvider {
  readonly id = 'null';

  isConfigured(): boolean {
    return false;
  }

  async complete(): Promise<LlmResponse> {
    throw new LlmError(
      'not_configured',
      'No LLM provider is configured. Set OPENAI_API_KEY to enable the LLM path.'
    );
  }
}

/**
 * Resolves the active provider. Reads the environment on every call so a key
 * added at runtime takes effect without a restart of the module graph.
 * Pass `purpose: 'report'` for full executive reports (`AI_MODEL_REPORT`).
 * Never throws.
 */
export function getLlmProvider(
  configOrPurpose: LlmConfig | LlmModelPurpose = resolveLlmConfig()
): LlmProvider {
  const config =
    typeof configOrPurpose === 'string'
      ? resolveLlmConfigForPurpose(configOrPurpose)
      : configOrPurpose;
  const provider = new OpenAiCompatibleProvider(config);
  return provider.isConfigured() ? provider : new NullProvider();
}

export function isLlmConfigured(config: LlmConfig = resolveLlmConfig()): boolean {
  return config.apiKey.length > 0;
}
