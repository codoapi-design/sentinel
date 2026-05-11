import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './lib/supabase/types';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // السماح بالمسارات العامة
  const publicPaths = ['/', '/login', '/signup', '/demo', '/auth/callback'];
  const isPublicPath = publicPaths.some(path => pathname === path);
  const isApiPath = pathname.startsWith('/api/');
  const isStaticAsset = pathname.startsWith('/_next/') || pathname.includes('.');

  // تحديث الجلسة عن طريق الكوكيز (هام جداً لتسجيل الدخول)
  const supabaseResponse = await updateSession(request);

  if (isPublicPath || isApiPath || isStaticAsset) {
    return supabaseResponse;
  }

  // إنشاء عميل Supabase للقراءة من الكوكيز
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  // حماية مسارات الأدمن
  const isAdminPath = pathname.startsWith('/admin');

  if (isAdminPath) {
    // السماح بصفحة تسجيل دخول الأدمن
    if (pathname === '/admin/login') {
      return supabaseResponse;
    }

    try {
      const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      });

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // التحقق من صلاحية الأدمن
      const { data: adminData, error } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error || !adminData) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }

      // إضافة معلومات الأدمن للرأس
      const response = NextResponse.next({
        request,
      });
      response.headers.set('x-admin-role', adminData.role);
      response.headers.set('x-admin-id', user.id);
      // نسخ الكوكيز من supabaseResponse
      supabaseResponse.cookies.getAll().forEach(cookie => {
        response.cookies.set(cookie.name, cookie.value);
      });
      return response;
    } catch {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // حماية لوحة المستخدم العادية
  const isUserPath = pathname.startsWith('/dashboard');
  if (isUserPath) {
    try {
      const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      });

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }

      // المستخدم مسجل الدخول - السماح بالوصول
      return supabaseResponse;
    } catch {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt).*)'],
};
