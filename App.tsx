/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Coffee,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
  Sparkles,
  Phone,
  User,
  MessageSquare,
  Database,
  Settings,
  RefreshCw,
  Trash2,
  Check,
  Copy,
  ExternalLink,
  X,
  Loader2
} from 'lucide-react';
import {
  getSupabase,
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection
} from './supabase';
import { SUPABASE_SQL_SCRIPT } from './supabaseSql';

/**
 * 음료 메뉴 항목 인터페이스
 */
interface DrinkMenu {
  id: string;
  name: string;
  price: number;
}

/**
 * 사이즈 옵션 인터페이스
 */
interface SizeOption {
  id: 'S' | 'M' | 'L';
  name: string;
  extraPrice: number;
}

/**
 * 추가 옵션 항목 인터페이스
 */
interface ExtraOption {
  id: string;
  name: string;
  price: number;
}

/**
 * 접수된 주문 데이터 인터페이스 (게시판 관리용)
 */
interface CafeOrder {
  id: string;
  customerName: string;
  phone: string;
  drinkName: string;
  drinkPrice: number;
  size: 'S' | 'M' | 'L';
  sizePrice: number;
  selectedOptions: string[];
  optionsPrice: number;
  quantity: number;
  requests: string;
  totalPrice: number;
  createdAt: string;
  orderStatus: '접수완료' | '제조중' | '제조완료';
  isLocalOnly?: boolean;
}

// -------------------------------------------------------------
// 메뉴 및 옵션 기본 데이터 정의
// -------------------------------------------------------------
const DRINKS: DrinkMenu[] = [
  { id: 'americano', name: '아메리카노', price: 3500 },
  { id: 'latte', name: '카페라떼', price: 4000 },
  { id: 'mocha', name: '카페모카', price: 4500 },
  { id: 'vanilla', name: '바닐라라떼', price: 4500 },
  { id: 'greentea', name: '녹차라떼', price: 4500 },
];

const SIZES: SizeOption[] = [
  { id: 'S', name: 'S', extraPrice: 0 },
  { id: 'M', name: 'M (기본 선택)', extraPrice: 500 },
  { id: 'L', name: 'L', extraPrice: 1000 },
];

const EXTRA_OPTIONS: ExtraOption[] = [
  { id: 'shot', name: '샷 추가', price: 500 },
  { id: 'cream', name: '크림 추가', price: 500 },
  { id: 'syrup', name: '시럽 추가', price: 300 },
  { id: 'decaf', name: '디카페인', price: 0 },
];

export default function App() {
  // -----------------------------------------------------------
  // 1. 주문서 입력 상태 (State) 관리
  // -----------------------------------------------------------
  const [customerName, setCustomerName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [selectedDrinkId, setSelectedDrinkId] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L'>('M'); // 기본값: M
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1); // 최소 1, 최대 10, 기본값 1
  const [requests, setRequests] = useState<string>('');

  // 유효성 검사 에러 메시지
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 주문 성공 확인 메시지
  const [orderConfirmMessage, setOrderConfirmMessage] = useState<string | null>(null);

  // 주문 제출 로딩 상태
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 최근 접수된 주문 목록 (카페 주문 게시판)
  const [ordersBoard, setOrdersBoard] = useState<CafeOrder[]>([
    {
      id: 'ORDER-DEMO-01',
      customerName: '홍길동',
      phone: '010-1234-5678',
      drinkName: '카페라떼',
      drinkPrice: 4000,
      size: 'M',
      sizePrice: 500,
      selectedOptions: ['샷 추가'],
      optionsPrice: 500,
      quantity: 1,
      requests: '얼음 적게 부탁드립니다.',
      totalPrice: 5000,
      createdAt: '방금 전',
      orderStatus: '접수완료',
      isLocalOnly: true,
    },
  ]);

  // 주문 목록 로딩 상태
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);

  // 활성 탭 (주문서 작성 vs 주문 게시판)
  const [activeTab, setActiveTab] = useState<'order' | 'board'>('order');

  // Supabase 연결 설정 모달 표시 여부
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);

  // Supabase 연결 상태 ('checking' | 'connected' | 'not_configured' | 'error' | 'table_missing')
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'not_configured' | 'error' | 'table_missing'>('checking');
  const [dbStatusMessage, setDbStatusMessage] = useState<string>('');

  // 모달 입력용 Supabase URL & Anon Key
  const [inputUrl, setInputUrl] = useState<string>('');
  const [inputAnonKey, setInputAnonKey] = useState<string>('');
  const [isTestingConfig, setIsTestingConfig] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sqlCopied, setSqlCopied] = useState<boolean>(false);

  // 입력창 포커스 참조
  const nameInputRef = useRef<HTMLInputElement>(null);
  const drinkSelectRef = useRef<HTMLSelectElement>(null);
  const confirmMessageRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------
  // 2. 실시간 예상 금액 계산 (useMemo 활용)
  // -----------------------------------------------------------
  const currentDrink = useMemo(() => {
    return DRINKS.find((d) => d.id === selectedDrinkId);
  }, [selectedDrinkId]);

  const currentSizeObj = useMemo(() => {
    return SIZES.find((s) => s.id === selectedSize) || SIZES[1];
  }, [selectedSize]);

  const totalOptionsPrice = useMemo(() => {
    return selectedOptions.reduce((sum, optId) => {
      const opt = EXTRA_OPTIONS.find((o) => o.id === optId);
      return sum + (opt ? opt.price : 0);
    }, 0);
  }, [selectedOptions]);

  const expectedTotalPrice = useMemo(() => {
    if (!currentDrink) {
      return 0;
    }
    const singleItemPrice = currentDrink.price + currentSizeObj.extraPrice + totalOptionsPrice;
    return singleItemPrice * Math.max(1, Math.min(10, quantity));
  }, [currentDrink, currentSizeObj, totalOptionsPrice, quantity]);

  // -----------------------------------------------------------
  // 3. Supabase 데이터 조회 및 실시간 연동
  // -----------------------------------------------------------

  /**
   * Supabase cafe_menu 테이블에서 주문 목록 가져오기
   */
  const loadOrdersFromSupabase = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setDbStatus('not_configured');
      setDbStatusMessage('Supabase URL과 Anon Key를 설정해주세요.');
      return;
    }

    setIsLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('cafe_menu')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          setDbStatus('table_missing');
          setDbStatusMessage('cafe_menu 테이블이 없습니다. 상단 SQL로 생성해주세요.');
        } else {
          setDbStatus('error');
          setDbStatusMessage(error.message);
        }
        return;
      }

      setDbStatus('connected');
      setDbStatusMessage('Supabase 연결 성공');

      if (data && data.length > 0) {
        const formattedOrders: CafeOrder[] = data.map((item) => {
          let formattedTime = '방금 전';
          if (item.created_at) {
            try {
              const date = new Date(item.created_at);
              formattedTime = date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });
            } catch {
              formattedTime = item.created_at;
            }
          }

          return {
            id: String(item.id),
            customerName: item.customer_name || '익명',
            phone: item.phone_number || item.phone || '연락처 미기재',
            drinkName: item.drink_name || '음료',
            drinkPrice: item.drink_price || 0,
            size: (item.size as 'S' | 'M' | 'L') || 'M',
            sizePrice: item.size_price || 0,
            selectedOptions: Array.isArray(item.options) ? item.options : [],
            optionsPrice: item.options_price || 0,
            quantity: item.quantity || 1,
            requests: item.requests || '요청사항 없음',
            totalPrice: item.total_price || 0,
            createdAt: formattedTime,
            orderStatus: (item.order_status as '접수완료' | '제조중' | '제조완료') || '접수완료',
            isLocalOnly: false,
          };
        });

        setOrdersBoard(formattedOrders);
      }
    } catch (err: unknown) {
      console.error('Supabase 주문 목록 조회 실패:', err);
      setDbStatus('error');
      setDbStatusMessage('데이터베이스 접속 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  // 초기 로드 시 Supabase 연결 확인 및 데이터 로드
  useEffect(() => {
    const config = getStoredSupabaseConfig();
    setInputUrl(config.url);
    setInputAnonKey(config.anonKey);

    if (config.isConfigured) {
      loadOrdersFromSupabase();

      // Supabase Realtime 구독 설정
      const supabase = getSupabase();
      if (supabase) {
        const channel = supabase
          .channel('cafe_menu_realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'cafe_menu' },
            () => {
              loadOrdersFromSupabase();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    } else {
      setDbStatus('not_configured');
      setDbStatusMessage('Supabase가 연결되지 않았습니다.');
    }
  }, [loadOrdersFromSupabase]);

  // -----------------------------------------------------------
  // 4. 이벤트 핸들러 함수들
  // -----------------------------------------------------------

  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      } else {
        return [...prev, optionId];
      }
    });
  };

  const handleQuantityChange = (newVal: number) => {
    if (isNaN(newVal)) return;
    const clamped = Math.max(1, Math.min(10, newVal));
    setQuantity(clamped);
  };

  const handleReset = () => {
    setCustomerName('');
    setPhoneNumber('');
    setSelectedDrinkId('');
    setSelectedSize('M');
    setSelectedOptions([]);
    setQuantity(1);
    setRequests('');
    setErrorMessage(null);
    setOrderConfirmMessage(null);
  };

  /**
   * 주문하기 제출 핸들러 (유효성 검사 및 Supabase INSERT)
   */
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setOrderConfirmMessage(null);

    // 1) 이름 유효성 검사
    if (!customerName.trim()) {
      setErrorMessage('이름을 입력해주세요');
      nameInputRef.current?.focus();
      return;
    }

    // 2) 음료 선택 유효성 검사
    if (!selectedDrinkId || !currentDrink) {
      setErrorMessage('음료를 선택해주세요');
      drinkSelectRef.current?.focus();
      return;
    }

    const selectedOptionNames = selectedOptions
      .map((optId) => EXTRA_OPTIONS.find((o) => o.id === optId)?.name)
      .filter(Boolean) as string[];

    const optionsText =
      selectedOptionNames.length > 0 ? ` (${selectedOptionNames.join(', ')})` : '';

    const confirmationText = `${customerName.trim()}님, ${currentDrink.name} ${selectedSize}사이즈${optionsText} ${quantity}잔, 총 ${expectedTotalPrice.toLocaleString()}원 주문이 접수되었습니다!`;

    setIsSubmitting(true);
    const supabase = getSupabase();

    if (supabase && dbStatus === 'connected') {
      try {
        // Supabase cafe_menu 테이블에 INSERT
        const { data, error } = await supabase
          .from('cafe_menu')
          .insert([
            {
              customer_name: customerName.trim(),
              phone_number: phoneNumber.trim() || null,
              drink_name: currentDrink.name,
              drink_price: currentDrink.price,
              size: selectedSize,
              size_price: currentSizeObj.extraPrice,
              options: selectedOptionNames,
              options_price: totalOptionsPrice,
              quantity,
              requests: requests.trim() || null,
              total_price: expectedTotalPrice,
              order_status: '접수완료',
            },
          ])
          .select();

        if (error) {
          console.error('Supabase INSERT 에러:', error);
          // DB 에러 시 로컬 저장으로 폴백
          addOrderToLocal(confirmationText, selectedOptionNames);
          setErrorMessage(`Supabase 저장 실패 (${error.message}). 로컬에 임시 저장되었습니다.`);
        } else {
          setOrderConfirmMessage(confirmationText);
          await loadOrdersFromSupabase();
        }
      } catch (err: unknown) {
        console.error('주문 전송 중 예외 발생:', err);
        addOrderToLocal(confirmationText, selectedOptionNames);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Supabase 미연결 시 로컬 메모리에 저장
      addOrderToLocal(confirmationText, selectedOptionNames);
      setIsSubmitting(false);
    }

    setTimeout(() => {
      confirmMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  };

  const addOrderToLocal = (confirmText: string, selectedOptionNames: string[]) => {
    if (!currentDrink) return;

    const newOrder: CafeOrder = {
      id: `ORDER-${Date.now().toString().slice(-6)}`,
      customerName: customerName.trim(),
      phone: phoneNumber.trim() || '연락처 미기재',
      drinkName: currentDrink.name,
      drinkPrice: currentDrink.price,
      size: selectedSize,
      sizePrice: currentSizeObj.extraPrice,
      selectedOptions: selectedOptionNames,
      optionsPrice: totalOptionsPrice,
      quantity,
      requests: requests.trim() || '요청사항 없음',
      totalPrice: expectedTotalPrice,
      createdAt: '방금 전',
      orderStatus: '접수완료',
      isLocalOnly: true,
    };

    setOrdersBoard((prev) => [newOrder, ...prev]);
    setOrderConfirmMessage(confirmText);
  };

  /**
   * 주문 상태 변경 (접수완료 -> 제조중 -> 제조완료)
   */
  const handleUpdateStatus = async (orderId: string, currentStatus: CafeOrder['orderStatus']) => {
    const nextStatus: CafeOrder['orderStatus'] =
      currentStatus === '접수완료' ? '제조중' : currentStatus === '제조중' ? '제조완료' : '접수완료';

    const supabase = getSupabase();
    if (supabase && dbStatus === 'connected') {
      try {
        const { error } = await supabase
          .from('cafe_menu')
          .update({ order_status: nextStatus })
          .eq('id', orderId);

        if (!error) {
          loadOrdersFromSupabase();
          return;
        }
      } catch (err) {
        console.error('주문 상태 변경 실패:', err);
      }
    }

    // 로컬 상태 업데이트
    setOrdersBoard((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, orderStatus: nextStatus } : order))
    );
  };

  /**
   * 주문 삭제
   */
  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('이 주문을 삭제하시겠습니까?')) return;

    const supabase = getSupabase();
    if (supabase && dbStatus === 'connected') {
      try {
        const { error } = await supabase.from('cafe_menu').delete().eq('id', orderId);
        if (!error) {
          loadOrdersFromSupabase();
          return;
        }
      } catch (err) {
        console.error('주문 삭제 실패:', err);
      }
    }

    setOrdersBoard((prev) => prev.filter((order) => order.id !== orderId));
  };

  /**
   * 모달 내 Supabase 접속 테스트 및 저장 핸들러
   */
  const handleTestAndSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingConfig(true);
    setTestResult(null);

    const cleanUrl = inputUrl.trim();
    const cleanKey = inputAnonKey.trim();

    if (!cleanUrl || !cleanKey) {
      setTestResult({ success: false, message: 'URL과 Anon Key를 모두 입력해주세요.' });
      setIsTestingConfig(false);
      return;
    }

    const result = await testSupabaseConnection(cleanUrl, cleanKey);
    setTestResult(result);
    setIsTestingConfig(false);

    if (result.success || result.message.includes('cafe_menu 테이블이 없습니다')) {
      saveSupabaseConfig(cleanUrl, cleanKey);
      if (result.success) {
        setDbStatus('connected');
        setDbStatusMessage('Supabase 연결 성공');
        loadOrdersFromSupabase();
      } else {
        setDbStatus('table_missing');
        setDbStatusMessage(result.message);
      }
    }
  };

  /**
   * SQL 스크립트 클립보드 복사
   */
  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SQL_SCRIPT);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch {
      alert('SQL 복사 실패: 수동으로 복사해주세요.');
    }
  };

  return (
    <div className="min-h-screen bg-[#faf6f0] text-[#3b2210] py-8 px-4 flex flex-col items-center">
      <div className="w-full max-w-[520px] mx-auto flex flex-col gap-5">

        {/* ========================================================= */}
        {/* 상단 헤더: 카페 로고, 카페 이름, 부제, Supabase 연결 상태 */}
        {/* ========================================================= */}
        <header className="bg-white rounded-2xl p-6 shadow-sm border border-[#e8dfd5] text-center relative overflow-hidden">
          {/* 은은한 배경 요소 */}
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-[#faf6f0] rounded-full pointer-events-none opacity-80" />
          <div className="absolute -top-8 -left-8 w-24 h-24 bg-[#faf6f0] rounded-full pointer-events-none opacity-80" />

          {/* 상단 우측: Supabase 연결 설정 버튼 */}
          <div className="flex justify-end mb-1">
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                dbStatus === 'connected'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                  : dbStatus === 'table_missing'
                  ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                  : 'bg-[#f7efe7] border-[#d8cbbe] text-[#7d5e46] hover:bg-[#ede2d6]'
              }`}
              title="Supabase 데이터베이스 연결 설정"
            >
              <Database className="w-3.5 h-3.5" />
              <span>
                {dbStatus === 'connected'
                  ? 'Supabase 연결됨'
                  : dbStatus === 'table_missing'
                  ? '테이블 생성 필요'
                  : dbStatus === 'checking'
                  ? '연결 확인 중...'
                  : 'Supabase 연결'}
              </span>
              <Settings className="w-3 h-3 opacity-60 ml-0.5" />
            </button>
          </div>

          {/* 1. 카페 로고: ☕ 이모지 크게 */}
          <div className="text-5xl mb-2 select-none animate-bounce duration-1000 inline-block">
            ☕
          </div>

          {/* 2. 카페 이름: "바이브 카페" */}
          <h1 className="text-2xl font-bold tracking-tight text-[#6b4226] mb-1">
            바이브 카페
          </h1>

          {/* 3. 부제: "당신의 하루에 바이브를 더하다" */}
          <p className="text-sm text-[#8c6b53] font-medium">
            당신의 하루에 바이브를 더하다
          </p>

          {/* 상단 탭 전환: 주문서 작성 / 주문 게시판 */}
          <div className="mt-5 pt-3 border-t border-[#f0e6dc] flex justify-center">
            <div className="inline-flex p-1 bg-[#f5ede4] rounded-xl gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('order')}
                className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'order'
                    ? 'bg-[#6b4226] text-white shadow-xs'
                    : 'text-[#6b4226] hover:bg-[#e8ded3]'
                }`}
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>주문서 작성</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('board');
                  if (dbStatus === 'connected') {
                    loadOrdersFromSupabase();
                  }
                }}
                className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'board'
                    ? 'bg-[#6b4226] text-white shadow-xs'
                    : 'text-[#6b4226] hover:bg-[#e8ded3]'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>주문 게시판 ({ordersBoard.length})</span>
              </button>
            </div>
          </div>
        </header>

        {/* ========================================================= */}
        {/* 탭 1: 주문서 작성 화면 */}
        {/* ========================================================= */}
        {activeTab === 'order' && (
          <main className="bg-white rounded-2xl p-6 shadow-sm border border-[#e8dfd5] transition-all">
            <form onSubmit={handleOrderSubmit} noValidate className="flex flex-col gap-5">
              
              {/* 항목 1. 이름 (필수, text) */}
              <div>
                <label
                  htmlFor="customer-name"
                  className="block text-sm font-bold text-[#4a2e19] mb-1.5 flex items-center gap-1.5"
                >
                  <User className="w-4 h-4 text-[#8c6b53]" />
                  <span>이름</span>
                  <span className="text-red-500 font-bold" title="필수 입력 항목">*</span>
                </label>
                <input
                  id="customer-name"
                  ref={nameInputRef}
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="주문하시는 분의 성함을 입력하세요 (예: 홍길동)"
                  className="cafe-input"
                  required
                />
              </div>

              {/* 항목 2. 전화번호 (tel) */}
              <div>
                <label
                  htmlFor="customer-phone"
                  className="block text-sm font-bold text-[#4a2e19] mb-1.5 flex items-center gap-1.5"
                >
                  <Phone className="w-4 h-4 text-[#8c6b53]" />
                  <span>전화번호</span>
                  <span className="text-xs text-[#9d816c] font-normal">(선택)</span>
                </label>
                <input
                  id="customer-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="010-0000-0000"
                  className="cafe-input"
                />
              </div>

              {/* 항목 3. 음료 선택 (드롭다운) */}
              <div>
                <label
                  htmlFor="drink-select"
                  className="block text-sm font-bold text-[#4a2e19] mb-1.5 flex items-center gap-1.5"
                >
                  <Coffee className="w-4 h-4 text-[#8c6b53]" />
                  <span>음료 선택</span>
                  <span className="text-red-500 font-bold" title="필수 입력 항목">*</span>
                </label>
                <select
                  id="drink-select"
                  ref={drinkSelectRef}
                  value={selectedDrinkId}
                  onChange={(e) => {
                    setSelectedDrinkId(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="cafe-input cursor-pointer bg-white"
                >
                  <option value="">-- 음료를 선택해주세요 --</option>
                  {DRINKS.map((drink) => (
                    <option key={drink.id} value={drink.id}>
                      {drink.name} - {drink.price.toLocaleString()}원
                    </option>
                  ))}
                </select>
              </div>

              {/* 항목 4. 사이즈 (라디오 버튼, 가로 배치) */}
              <div>
                <span className="block text-sm font-bold text-[#4a2e19] mb-2">
                  사이즈 선택
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {SIZES.map((size) => {
                    const isChecked = selectedSize === size.id;
                    const radioId = `size-option-${size.id.toLowerCase()}`;
                    return (
                      <label
                        key={size.id}
                        htmlFor={radioId}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all ${
                          isChecked
                            ? 'border-[#6b4226] bg-[#fbf5ee] text-[#6b4226] shadow-xs'
                            : 'border-[#e0d6cb] bg-white text-[#634833] hover:border-[#bda692]'
                        }`}
                      >
                        <input
                          type="radio"
                          id={radioId}
                          name="sizeOption"
                          value={size.id}
                          checked={isChecked}
                          onChange={() => setSelectedSize(size.id)}
                          className="accent-[#6b4226] w-4 h-4 cursor-pointer"
                        />
                        <span>
                          {size.name}
                          <span className="text-xs text-[#8c6b53] ml-1">
                            (+{size.extraPrice.toLocaleString()}원)
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 항목 5. 추가 옵션 (체크박스, 가로 배치) */}
              <div>
                <span className="block text-sm font-bold text-[#4a2e19] mb-2">
                  추가 옵션
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {EXTRA_OPTIONS.map((option) => {
                    const isChecked = selectedOptions.includes(option.id);
                    const checkboxId = `extra-option-${option.id}`;
                    return (
                      <label
                        key={option.id}
                        htmlFor={checkboxId}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all ${
                          isChecked
                            ? 'border-[#6b4226] bg-[#fbf5ee] text-[#6b4226] shadow-xs'
                            : 'border-[#e0d6cb] bg-white text-[#634833] hover:border-[#bda692]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={checkboxId}
                          checked={isChecked}
                          onChange={() => handleOptionToggle(option.id)}
                          className="accent-[#6b4226] w-4 h-4 rounded cursor-pointer"
                        />
                        <span>
                          {option.name}
                          <span className="text-xs text-[#8c6b53] ml-1">
                            (+{option.price.toLocaleString()}원)
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 항목 6. 수량 (number 타입, 최소 1, 최대 10, 기본값 1) */}
              <div>
                <label
                  htmlFor="order-quantity"
                  className="block text-sm font-bold text-[#4a2e19] mb-1.5"
                >
                  수량 (최소 1잔, 최대 10잔)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(quantity - 1)}
                    disabled={quantity <= 1}
                    className="w-10 h-10 rounded-lg border border-[#d8cbbe] bg-[#faf6f0] text-[#6b4226] font-bold text-lg hover:bg-[#f0e5d8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="수량 감소"
                  >
                    -
                  </button>
                  <input
                    id="order-quantity"
                    type="number"
                    min={1}
                    max={10}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
                    className="cafe-input text-center font-bold text-lg max-w-[100px]"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuantityChange(quantity + 1)}
                    disabled={quantity >= 10}
                    className="w-10 h-10 rounded-lg border border-[#d8cbbe] bg-[#faf6f0] text-[#6b4226] font-bold text-lg hover:bg-[#f0e5d8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="수량 증가"
                  >
                    +
                  </button>
                  <span className="text-xs text-[#8c6b53]">
                    {quantity}잔 선택 중
                  </span>
                </div>
              </div>

              {/* 항목 7. 요청사항 (textarea) */}
              <div>
                <label
                  htmlFor="customer-requests"
                  className="block text-sm font-bold text-[#4a2e19] mb-1.5 flex items-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4 text-[#8c6b53]" />
                  <span>요청사항</span>
                  <span className="text-xs text-[#9d816c] font-normal">(선택)</span>
                </label>
                <textarea
                  id="customer-requests"
                  rows={3}
                  value={requests}
                  onChange={(e) => setRequests(e.target.value)}
                  placeholder="예: 덜 달게 해주세요, 얼음 조금만 넣어주세요 등"
                  className="cafe-input resize-none"
                />
              </div>

              {/* 유효성 검사 에러 알림창 */}
              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-semibold"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 실시간 예상 금액 표시 영역 */}
              <div className="pt-4 border-t border-[#f0e6dc] text-center">
                <div className="text-xs text-[#8c6b53] mb-1 font-medium">
                  {selectedDrinkId
                    ? `${currentDrink?.name} (${selectedSize}) · 옵션 ${selectedOptions.length}개 · ${quantity}잔`
                    : '음료를 선택하시면 실시간 금액이 표시됩니다'}
                </div>
                <div className="text-[24px] font-bold text-[#6b4226] text-center tracking-tight">
                  예상 금액: {expectedTotalPrice.toLocaleString()}원
                </div>
              </div>

              {/* 버튼 그룹: 주문하기 & 다시 작성 */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="cafe-btn-primary w-full py-3.5 px-4 rounded-xl font-bold text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>주문 접수 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>주문하기</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-[#7d5e46] bg-[#f5efe8] hover:bg-[#ede3d8] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>다시 작성</span>
                </button>
              </div>

              {/* 주문 확인 메시지 */}
              {orderConfirmMessage && (
                <div
                  ref={confirmMessageRef}
                  tabIndex={-1}
                  role="status"
                  className="mt-3 p-4 bg-[#e8f5e9] text-[#1b5e20] border border-[#a5d6a7] rounded-xl text-center font-bold text-sm sm:text-base leading-relaxed shadow-xs flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-[#2e7d32]" />
                  <span>{orderConfirmMessage}</span>
                </div>
              )}
            </form>
          </main>
        )}

        {/* ========================================================= */}
        {/* 탭 2: 주문 접수 현황 (카페 게시판) */}
        {/* ========================================================= */}
        {activeTab === 'board' && (
          <main className="bg-white rounded-2xl p-6 shadow-sm border border-[#e8dfd5]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#f0e6dc]">
              <div>
                <h2 className="text-lg font-bold text-[#4a2e19] flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-[#6b4226]" />
                  주문 접수 게시판
                </h2>
                <p className="text-xs text-[#8c6b53] mt-0.5">
                  {dbStatus === 'connected'
                    ? '🟢 Supabase DB와 실시간 동기화 중입니다.'
                    : '🟡 로컬 상태로 표시 중입니다 (Supabase 미연결)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {dbStatus === 'connected' && (
                  <button
                    type="button"
                    onClick={loadOrdersFromSupabase}
                    disabled={isLoadingOrders}
                    className="p-1.5 rounded-lg border border-[#e0d6cb] hover:bg-[#faf6f0] text-[#6b4226] transition-colors cursor-pointer"
                    title="새로고침"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <span className="text-xs bg-[#f4ece3] text-[#6b4226] font-bold px-2.5 py-1 rounded-full">
                  총 {ordersBoard.length}건
                </span>
              </div>
            </div>

            {ordersBoard.length === 0 ? (
              <div className="text-center py-12 text-[#9d816c]">
                <Coffee className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">아직 접수된 주문이 없습니다.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('order')}
                  className="mt-3 text-xs text-[#6b4226] font-bold underline cursor-pointer"
                >
                  첫 번째 주문 작성하러 가기
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {ordersBoard.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 rounded-xl border border-[#ede2d5] bg-[#fdfbf9] hover:border-[#d9c5b2] transition-colors relative group"
                  >
                    <div className="flex items-center justify-between text-xs text-[#8c6b53] mb-2">
                      <span className="font-mono font-semibold text-[#6b4226] bg-[#f4ece3] px-2 py-0.5 rounded flex items-center gap-1">
                        #{order.id}
                        {order.isLocalOnly && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-1 rounded">로컬</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{order.createdAt}</span>
                        {/* 상태 토글 버튼 */}
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(order.id, order.orderStatus)}
                          className={`text-xs font-bold px-2 py-0.5 rounded cursor-pointer transition-all ${
                            order.orderStatus === '접수완료'
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : order.orderStatus === '제조중'
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                          title="클릭하여 상태 변경"
                        >
                          ● {order.orderStatus}
                        </button>
                        {/* 삭제 버튼 */}
                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(order.id)}
                          className="text-[#a38c79] hover:text-red-600 p-1 transition-colors cursor-pointer"
                          title="주문 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-bold text-[#3b2210] text-base">
                        {order.drinkName}{' '}
                        <span className="text-xs text-[#8c6b53] font-normal">
                          ({order.size}사이즈, {order.quantity}잔)
                        </span>
                      </h3>
                      <span className="text-base font-bold text-[#6b4226]">
                        {order.totalPrice.toLocaleString()}원
                      </span>
                    </div>

                    <div className="text-xs text-[#634833] space-y-1 mt-2 pt-2 border-t border-[#f4eae0]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#8c6b53]">주문자:</span>
                        <span className="font-medium">{order.customerName} ({order.phone})</span>
                      </div>

                      {order.selectedOptions.length > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-[#8c6b53]">추가 옵션:</span>
                          <span className="font-medium text-[#7d5e46]">
                            {order.selectedOptions.join(', ')}
                          </span>
                        </div>
                      )}

                      {order.requests && order.requests !== '요청사항 없음' && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[#8c6b53] flex-shrink-0">요청사항:</span>
                          <span className="font-medium text-[#7d5e46] text-right">
                            {order.requests}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        )}

        {/* 푸터 */}
        <footer className="text-center text-xs text-[#a38c79] pb-4 flex flex-col items-center gap-1">
          <p>© 2026 바이브 카페 (Vibe Cafe). All rights reserved.</p>
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="text-[11px] text-[#8c6b53] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Database className="w-3 h-3" />
            <span>Supabase 설정 및 SQL 가이드 열기</span>
          </button>
        </footer>
      </div>

      {/* ========================================================= */}
      {/* Supabase 설정 & SQL 안내 모달 */}
      {/* ========================================================= */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#e8dfd5] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#f0e6dc] mb-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-[#6b4226]" />
                <h3 className="font-bold text-lg text-[#4a2e19]">Supabase 연결 설정</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-[#9d816c] hover:text-[#4a2e19] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 현재 상태 표시 */}
            <div className={`p-3 rounded-xl mb-4 text-xs font-medium flex items-center gap-2 ${
              dbStatus === 'connected'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : dbStatus === 'table_missing'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-zinc-50 text-zinc-700 border border-zinc-200'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                dbStatus === 'connected' ? 'bg-emerald-500' : dbStatus === 'table_missing' ? 'bg-amber-500' : 'bg-zinc-400'
              }`} />
              <span>{dbStatusMessage || 'Supabase 설정 상태를 확인해주세요.'}</span>
            </div>

            {/* 1단계: Supabase 테이블 생성 SQL 복사 */}
            <div className="mb-5 bg-[#faf6f0] p-4 rounded-xl border border-[#ede2d5]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-[#6b4226] flex items-center gap-1.5">
                  <span>1단계: cafe_menu 테이블 생성 SQL</span>
                </h4>
                <div className="flex items-center gap-1.5">
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#6b4226] hover:underline flex items-center gap-0.5"
                  >
                    Supabase 바로가기 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-[#8c6b53] mb-2.5">
                Supabase 대시보드 <strong>SQL Editor</strong>에 붙여넣고 [Run]을 누르면 테이블이 자동 생성됩니다.
              </p>
              <button
                type="button"
                onClick={handleCopySql}
                className="w-full py-2 px-3 rounded-lg bg-white border border-[#d8cbbe] text-xs font-bold text-[#6b4226] hover:bg-[#f5ede4] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {sqlCopied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">SQL 쿼리문이 복사되었습니다!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>cafe_menu 테이블 생성 SQL 복사하기</span>
                  </>
                )}
              </button>
            </div>

            {/* 2단계: Supabase 접속 정보 입력 */}
            <form onSubmit={handleTestAndSaveConfig} className="flex flex-col gap-3">
              <h4 className="text-xs font-bold text-[#6b4226] mb-0.5">
                2단계: Supabase 프로젝트 키 입력
              </h4>
              <p className="text-[11px] text-[#8c6b53] -mt-2 mb-1">
                Supabase 대시보드 → <strong>Project Settings → API</strong>에서 URL 및 anon key를 복사하여 입력하세요. (또는 <code>.env.local</code> 파일에 설정 가능)
              </p>

              <div>
                <label className="block text-xs font-bold text-[#4a2e19] mb-1">
                  Project URL
                </label>
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="cafe-input text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a2e19] mb-1">
                  Anon Public Key
                </label>
                <input
                  type="text"
                  value={inputAnonKey}
                  onChange={(e) => setInputAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="cafe-input text-xs"
                  required
                />
              </div>

              {testResult && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  disabled={isTestingConfig}
                  className="flex-1 cafe-btn-primary py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isTestingConfig ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>연결 확인 중...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>연결 테스트 & 저장</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearSupabaseConfig();
                    setInputUrl('');
                    setInputAnonKey('');
                    setDbStatus('not_configured');
                    setDbStatusMessage('설정이 초기화되었습니다.');
                    setTestResult(null);
                  }}
                  className="px-3 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-medium transition-colors cursor-pointer"
                >
                  초기화
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
