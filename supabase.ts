import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase 설정 정보 조회
 * 1) .env.local 환경변수 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
 * 2) 브라우저 localStorage 저장값 (UI에서 직접 입력 시)
 */
export function getStoredSupabaseConfig(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
} {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  let localUrl = '';
  let localKey = '';
  if (typeof window !== 'undefined') {
    localUrl = (localStorage.getItem('vibe_cafe_supabase_url') || '').trim();
    localKey = (localStorage.getItem('vibe_cafe_supabase_anon_key') || '').trim();
  }

  const url = localUrl || envUrl;
  const anonKey = localKey || envKey;

  const isConfigured = Boolean(
    url &&
    anonKey &&
    !url.includes('your-project-id') &&
    !anonKey.includes('your-anon-key') &&
    url.startsWith('http')
  );

  return { url, anonKey, isConfigured };
}

let supabaseInstance: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

/**
 * Supabase 클라이언트 인스턴스 반환
 */
export function getSupabase(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getStoredSupabaseConfig();
  if (!isConfigured) {
    return null;
  }

  if (!supabaseInstance || lastUsedUrl !== url || lastUsedKey !== anonKey) {
    try {
      supabaseInstance = createClient(url, anonKey);
      lastUsedUrl = url;
      lastUsedKey = anonKey;
    } catch (err) {
      console.error('Supabase 클라이언트 생성 실패:', err);
      return null;
    }
  }

  return supabaseInstance;
}

/**
 * UI 설정창에서 Supabase 접속 정보 저장
 */
export function saveSupabaseConfig(url: string, anonKey: string): boolean {
  if (typeof window !== 'undefined') {
    localStorage.setItem('vibe_cafe_supabase_url', url.trim());
    localStorage.setItem('vibe_cafe_supabase_anon_key', anonKey.trim());
  }
  supabaseInstance = null;
  return Boolean(getSupabase());
}

/**
 * Supabase 접속 정보 삭제 및 초기화
 */
export function clearSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('vibe_cafe_supabase_url');
    localStorage.removeItem('vibe_cafe_supabase_anon_key');
  }
  supabaseInstance = null;
  lastUsedUrl = '';
  lastUsedKey = '';
}

/**
 * Supabase DB 테이블 cafe_menu 타입 정의
 */
export interface DbCafeOrder {
  id?: number | string;
  customer_name: string;
  phone_number?: string | null;
  phone?: string | null;
  drink_name: string;
  drink_price?: number;
  size: string;
  size_price?: number;
  options: string[];
  options_price?: number;
  quantity: number;
  requests?: string | null;
  total_price: number;
  order_status: string;
  created_at?: string;
}

/**
 * Supabase 연결 테스트 함수
 */
export async function testSupabaseConnection(url?: string, anonKey?: string): Promise<{ success: boolean; message: string }> {
  try {
    let client: SupabaseClient;
    if (url && anonKey) {
      client = createClient(url, anonKey);
    } else {
      const active = getSupabase();
      if (!active) {
        return { success: false, message: 'Supabase URL과 Anon Key가 설정되지 않았습니다.' };
      }
      client = active;
    }

    // cafe_menu 테이블 조회 시도
    const { error } = await client.from('cafe_menu').select('id').limit(1);

    if (error) {
      if (error.code === '42P01') {
        // 테이블이 아직 없는 경우
        return {
          success: false,
          message: 'Supabase 연결 성공! 단, cafe_menu 테이블이 없습니다. 상단 SQL 복사 버튼을 눌러 테이블을 생성해주세요.',
        };
      }
      return { success: false, message: `접속 오류: ${error.message}` };
    }

    return { success: true, message: 'Supabase 및 cafe_menu 테이블 연결에 성공했습니다!' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `연결 테스트 중 오류 발생: ${errorMsg}` };
  }
}
