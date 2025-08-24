// Simple test to verify Jest setup is working
describe('Jest Setup Test', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have mocked Next.js router', () => {
    const { useRouter } = require('next/router')
    const router = useRouter()
    expect(router.push).toBeDefined()
    expect(typeof router.push).toBe('function')
  })

  it('should have mocked Next.js navigation', () => {
    const { useRouter } = require('next/navigation')
    const router = useRouter()
    expect(router.push).toBeDefined()
    expect(typeof router.push).toBe('function')
  })

  it('should have environment variables configured', () => {
    // In real data testing mode, we expect real URLs
    if (process.env.ENABLE_REAL_DATA_TESTING === 'true') {
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toContain('supabase.co')
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined()
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length).toBeGreaterThan(20)
    } else {
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co')
      expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key')
    }
  })

  it('should have mocked fetch', () => {
    expect(global.fetch).toBeDefined()
    expect(typeof global.fetch).toBe('function')
  })

  it('should have mocked window.matchMedia (if window exists)', () => {
    if (typeof window !== 'undefined') {
      expect(window.matchMedia).toBeDefined()
      expect(typeof window.matchMedia).toBe('function')
    } else {
      expect(true).toBe(true) // Pass in node environment
    }
  })
})