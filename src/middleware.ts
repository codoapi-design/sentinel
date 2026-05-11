import { createServerClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // السماح بالمسارات العامة
  const publicPaths = ['/', '/login', '/signup', '/demo', '/auth/callback'];
  const isPublicPath = publicPaths.some(path => pathname === path);
  const isApiPath = pathname.startsWith('/api/');
  const isStaticAsset = pathname.startsWith('/_next/') || pathname.includes('.');

  if (isPublicPath || isApiPath || isStaticAsset) {
    return NextResponse.next();
  }

  // حماية مسارات الأدمن
  const isAdminPath = pathname.startsWith('/admin');

  if (isAdminPath) {
    // السماح بصفحة تسجيل دخول الأدمن
    if (pathname === '/admin/login') {
      return NextResponse.next();
    }

    // التحقق من الجلسة عبر cookies
    const supabase = createServerClient();

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      // التحقق من صلاحية الأدمن
      const { data: adminData, error } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

      if (error || !adminData) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }

      // إضافة معلومات الأدمن للرأس
      const response = NextResponse.next();
      response.headers.set('x-admin-role', adminData.role);
      response.headers.set('x-admin-id', session.user.id);
      return response;
    } catch {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // حماية لوحة المستخدم العادية
  const isUserPath = pathname.startsWith('/dashboard');
  if (isUserPath) {
    const supabase = createServerClient();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
      }
    } catch {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt).*)'],
};
