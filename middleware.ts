import { updateSession } from '@/lib/supabase/proxy'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // Log initialization for debugging (Edge runtime)
  console.log('Middleware initialized for path:', request.nextUrl.pathname)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('CRITICAL: Supabase environment variables missing in Edge runtime!')
  }

  // Update session and get user in one go
  const { supabaseResponse: response, user } = await updateSession(request)

  const { pathname } = request.nextUrl

  // Create a Supabase client for database checks
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        },
      },
    }
  )

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/auth/login', '/auth/sign-up', '/auth/sign-up-success', '/auth/error']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // If user is authenticated via Supabase Auth, verify they exist in the public.profiles table
  let dbUser = null
  if (user) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error fetching profile in middleware:', error)
      }
      dbUser = data
    } catch (e) {
      console.error('Exception fetching profile in middleware:', e)
    }
  }

  // If user is NOT logged in OR missing from the database, redirect to login (unless already on a public route)
  if ((!user || !dbUser) && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If user is logged in AND exists in db, and trying to access login page, redirect to dashboard
  if (user && dbUser && (pathname === '/login' || pathname === '/auth/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
