-- Owner write policies for investment_lots (service role already bypasses RLS).
-- Safe to re-run.

DROP POLICY IF EXISTS "Users can insert own investment lots" ON public.investment_lots;
CREATE POLICY "Users can insert own investment lots"
  ON public.investment_lots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own investment lots" ON public.investment_lots;
CREATE POLICY "Users can update own investment lots"
  ON public.investment_lots FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own investment lots" ON public.investment_lots;
CREATE POLICY "Users can delete own investment lots"
  ON public.investment_lots FOR DELETE
  USING (auth.uid() = user_id);
