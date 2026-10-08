/**
 * ==========================================================================
 * 바이브 카페 (Vibe Cafe) 주문서 및 Supabase 연동 스크립트
 * ==========================================================================
 * 초보자를 위해 각 기능별로 상세한 주석이 작성되어 있습니다.
 */

// ==========================================================================
// 0. Supabase 설정 및 클라이언트 초기화
// ==========================================================================
// 아래 SUPABASE_URL과 SUPABASE_KEY에 본인의 Supabase 프로젝트 정보를 입력하세요.
const SUPABASE_URL = 'https://xdijerhknzaqaajldnxm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkaWplcmhrbnphcWFhamxkbnhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTU4OTEsImV4cCI6MjEwNjk3MTg5MX0.4mN2XFY6K-MxO6GJOPDMf_O8TyxINgdRxxpqPGDU4fc';

// Supabase 클라이언트 객체 생성 (CDN으로 로드된 window.supabase 사용)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================================================
// 1. 상태(데이터) 관리 변수
// ==========================================================================
// 접수된 주문 객체들을 담아둘 배열
const orders = [];

// 주문 번호 카운터 (#1, #2, ...)
let orderSequence = 0;

// ==========================================================================
// 2. 사용할 HTML 요소(DOM) 가져오기
// ==========================================================================
// 탭 관련 요소
const tabOrder = document.getElementById('tab-order');
const tabHistory = document.getElementById('tab-history');
const orderTabContent = document.getElementById('order-tab-content');
const historyTabContent = document.getElementById('history-tab-content');
const orderCountBadge = document.getElementById('order-count-badge');

// 주문 폼 및 입력 필드
const orderForm = document.getElementById('order-form');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const beverageSelect = document.getElementById('beverage-select');
const quantityInput = document.getElementById('quantity');
const requestsTextarea = document.getElementById('customer-requests');
const submitBtn = document.getElementById('submit-btn');

// 금액 및 확인 메시지
const totalPriceSpan = document.getElementById('total-price');
const orderConfirmation = document.getElementById('order-confirmation');

// 주문 내역 탭 내부 요소
const orderList = document.getElementById('order-list');
const emptyHistoryMessage = document.getElementById('empty-history-message');
const orderSummaryArea = document.getElementById('order-summary-area');
const totalOrdersSummary = document.getElementById('total-orders-summary');
const clearAllOrdersBtn = document.getElementById('clear-all-orders-btn');

// ==========================================================================
// 3. 총 금액 계산 함수 (calculateTotal)
// ==========================================================================
/**
 * 선택된 음료, 사이즈, 추가 옵션, 수량을 바탕으로 총 주문 금액을 계산하고
 * 화면의 "예상 금액" 자리에 천 단위 콤마를 찍어 표시합니다.
 * @returns {number} 계산된 최종 금액 (주문 접수 시 재사용)
 */
function calculateTotal() {
  // 1) 선택된 음료 가격 가져오기
  const selectedBeverageOption = beverageSelect.options[beverageSelect.selectedIndex];
  const beveragePrice = Number(selectedBeverageOption.dataset.price) || 0;

  // [조건] 음료를 아직 선택하지 않았으면 무조건 0원
  if (!beverageSelect.value || beveragePrice === 0) {
    totalPriceSpan.textContent = '0';
    return 0;
  }

  // 2) 선택된 사이즈 추가 금액
  const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
  const sizePrice = selectedSizeRadio ? Number(selectedSizeRadio.dataset.price) || 0 : 0;

  // 3) 체크된 추가 옵션들의 금액 합산
  const checkedOptionBoxes = document.querySelectorAll('input[name="options"]:checked');
  let optionsPrice = 0;
  checkedOptionBoxes.forEach((checkbox) => {
    optionsPrice += Number(checkbox.dataset.price) || 0;
  });

  // 4) 수량 (기본값 1, 최소 1)
  let quantity = Number(quantityInput.value) || 1;
  if (quantity < 1) {
    quantity = 1;
  }

  // 5) 한 잔당 금액 * 수량으로 최종 금액 계산
  const pricePerCup = beveragePrice + sizePrice + optionsPrice;
  const total = pricePerCup * quantity;

  // 천 단위 콤마 형식으로 화면에 표시
  totalPriceSpan.textContent = total.toLocaleString();

  return total;
}

// ==========================================================================
// 4. 주문 내역 화면 렌더링 함수 (renderOrders)
// ==========================================================================
/**
 * orders 배열을 바탕으로 주문 내역 탭의 목록, 뱃지, 요약 금액을 화면에 그립니다.
 * [보안 조건] 손님이 입력한 글자는 XSS 방지를 위해 innerHTML 대신 textContent로 삽입합니다.
 */
function renderOrders() {
  // 1) 주문 건수 배지 업데이트
  orderCountBadge.textContent = orders.length;

  // 2) 기존 목록 영역 비우기
  orderList.textContent = '';

  // 3) 주문이 한 건도 없는 경우
  if (orders.length === 0) {
    emptyHistoryMessage.classList.remove('hidden');
    orderSummaryArea.classList.add('hidden');
    return;
  }

  // 4) 주문이 있는 경우 안내 메시지 숨기고 요약 영역 보이기
  emptyHistoryMessage.classList.add('hidden');
  orderSummaryArea.classList.remove('hidden');

  // 총 주문 금액 계산
  let grandTotal = 0;

  // 5) 최신 주문 순으로 카드 DOM 생성
  orders.forEach((order) => {
    grandTotal += order.total;

    // 카드 컨테이너 (<div class="order-card">)
    const card = document.createElement('div');
    card.className = 'order-card';

    // 카드 헤더 (1줄 제목 + 취소 버튼)
    const cardHeader = document.createElement('div');
    cardHeader.className = 'order-card-header';

    // 1줄: "#1 홍길동님 · 5,000원"
    const title = document.createElement('div');
    title.className = 'order-card-title';
    title.textContent = `#${order.orderId} ${order.name}님 · ${order.total.toLocaleString()}원`;

    // 카드 오른쪽 위 취소 버튼
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'order-cancel-btn';
    cancelBtn.textContent = '취소';

    // 취소 버튼 클릭 이벤트 (confirm 창으로 재확인 후 삭제)
    cancelBtn.addEventListener('click', () => {
      const isConfirmed = confirm(`주문 #${order.orderId} (${order.name}님) 주문을 취소하시겠습니까?`);
      if (isConfirmed) {
        cancelOrder(order.orderId);
      }
    });

    cardHeader.appendChild(title);
    cardHeader.appendChild(cancelBtn);
    card.appendChild(cardHeader);

    // 2줄: "카페라떼 M사이즈 (샷 추가) 1잔"
    const detail = document.createElement('div');
    detail.className = 'order-card-detail';
    detail.textContent = `${order.beverage} ${order.size}사이즈${order.optionText} ${order.quantity}잔`;
    card.appendChild(detail);

    // 3줄: 요청사항(있을 때만) · 주문 시간
    const meta = document.createElement('div');
    meta.className = 'order-card-meta';
    if (order.requests) {
      meta.textContent = `요청: ${order.requests} · ${order.orderTime}`;
    } else {
      meta.textContent = order.orderTime;
    }
    card.appendChild(meta);

    // 목록에 카드 추가
    orderList.appendChild(card);
  });

  // 6) 하단 총 주문 금액 요약 문구 업데이트 (예: "총 주문 금액: 15,000원 (3건)")
  totalOrdersSummary.textContent = `총 주문 금액: ${grandTotal.toLocaleString()}원 (${orders.length}건)`;
}

// ==========================================================================
// 5. 단일 주문 취소 처리 함수 (cancelOrder)
// ==========================================================================
/**
 * 지정된 주문 ID의 주문을 orders 배열에서 찾아 제거하고 목록을 다시 그립니다.
 * @param {number} orderId 취소할 주문의 ID
 */
function cancelOrder(orderId) {
  const index = orders.findIndex((order) => order.orderId === orderId);
  if (index !== -1) {
    orders.splice(index, 1);
    renderOrders();
  }
}

// ==========================================================================
// 6. 탭 전환 기능
// ==========================================================================
/**
 * 탭을 전환하고 관련 컨텐츠 영역의 hidden 클래스를 토글합니다.
 * @param {'order' | 'history'} targetTab 보여줄 탭 이름
 */
function switchTab(targetTab) {
  if (targetTab === 'order') {
    tabOrder.classList.add('active');
    tabOrder.setAttribute('aria-selected', 'true');
    tabHistory.classList.remove('active');
    tabHistory.setAttribute('aria-selected', 'false');

    orderTabContent.classList.remove('hidden');
    historyTabContent.classList.add('hidden');
  } else if (targetTab === 'history') {
    tabHistory.classList.add('active');
    tabHistory.setAttribute('aria-selected', 'true');
    tabOrder.classList.remove('active');
    tabOrder.setAttribute('aria-selected', 'false');

    historyTabContent.classList.remove('hidden');
    orderTabContent.classList.add('hidden');

    renderOrders();
  }
}

// 탭 버튼 클릭 이벤트 연결
tabOrder.addEventListener('click', () => switchTab('order'));
tabHistory.addEventListener('click', () => switchTab('history'));

// ==========================================================================
// 7. 실시간 금액 계산 이벤트 등록
// ==========================================================================
orderForm.addEventListener('change', calculateTotal);
orderForm.addEventListener('input', calculateTotal);

// ==========================================================================
// 8. 주문하기 (submit) 이벤트 처리 및 Supabase DB 저장
// ==========================================================================
orderForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  // 1) 이름 유효성 검사
  const customerName = customerNameInput.value.trim();
  if (customerName === '') {
    alert('이름을 입력해주세요');
    customerNameInput.focus();
    return;
  }

  // 2) 음료 선택 유효성 검사
  if (!beverageSelect.value) {
    alert('음료를 선택해주세요');
    beverageSelect.focus();
    return;
  }

  // 3) 주문 정보 추출
  const selectedBeverageOption = beverageSelect.options[beverageSelect.selectedIndex];
  const beveragePrice = Number(selectedBeverageOption.dataset.price) || 0;
  const beverageName = selectedBeverageOption.text.replace(/\s*[0-9,]+원$/, '').trim();

  // 사이즈
  const selectedSizeRadio = document.querySelector('input[name="size"]:checked');
  const sizeValue = selectedSizeRadio ? selectedSizeRadio.value : 'M';

  // 옵션 목록 추출 (배열)
  const checkedOptionBoxes = document.querySelectorAll('input[name="options"]:checked');
  const optionNames = [];
  checkedOptionBoxes.forEach((checkbox) => {
    const label = document.querySelector(`label[for="${checkbox.id}"]`);
    if (label) {
      const cleanOptionName = label.textContent.replace(/\s*\+[0-9,]+원$/, '').trim();
      optionNames.push(cleanOptionName);
    }
  });

  // 옵션 표시용 텍스트 (옵션이 없으면 빈 문자열)
  const optionText = optionNames.length > 0 ? ` (${optionNames.join(', ')})` : '';

  // 수량 및 최종 금액
  const quantity = Number(quantityInput.value) || 1;
  const total = calculateTotal();
  const formattedTotal = total.toLocaleString();

  // 고객 연락처 및 요청사항
  const customerPhone = customerPhoneInput.value.trim();
  const requests = requestsTextarea.value.trim();

  // 주문 접수 시간
  const now = new Date();
  const orderTime = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // ========================================================================
  // [중복 클릭 방지] 저장하는 동안 주문하기 버튼 비활성화
  // ========================================================================
  submitBtn.disabled = true;
  submitBtn.textContent = '주문 처리 중...';

  try {
    // ======================================================================
    // 4) Supabase 'orders' 테이블에 데이터 저장 (INSERT)
    // 실제 DB 컬럼: customer_name, customer_phone, beverage, size, options, quantity, requests, total_price
    // ======================================================================
    const { data, error } = await supabaseClient
      .from('orders')
      .insert([
        {
          customer_name: customerName,
          customer_phone: customerPhone,
          beverage: beverageName,
          size: sizeValue,
          options: optionNames,
          quantity: quantity,
          requests: requests,
          total_price: total,
        },
      ])
      .select();

    // 에러 발생 시 catch 블록으로 이동
    if (error) {
      throw error;
    }

    // ======================================================================
    // 5) 저장 성공 시 처리
    // ======================================================================
    // Supabase에서 발급된 id가 있으면 사용하고, 없으면 기존 시퀀스 번호 사용
    const insertedId = data && data[0] && data[0].id ? data[0].id : ++orderSequence;

    // 로컬 orders 배열에 추가 (최신 주문이 맨 위로)
    const newOrder = {
      orderId: insertedId,
      name: customerName,
      phone: customerPhone,
      beverage: beverageName,
      size: sizeValue,
      options: optionNames,
      optionText: optionText,
      quantity: quantity,
      requests: requests,
      total: total,
      orderTime: orderTime,
    };
    orders.unshift(newOrder);

    // 주문 내역 탭 배지 및 목록 갱신
    renderOrders();

    // 기존 주문 확인 메시지 표시
    const confirmationMessage = `${customerName}님, ${beverageName} ${sizeValue}사이즈${optionText} ${quantity}잔, 총 ${formattedTotal}원 주문이 접수되었습니다!`;
    orderConfirmation.textContent = confirmationMessage;
    orderConfirmation.style.display = 'block';
    orderConfirmation.classList.remove('hidden');

    // 화면 스크롤 이동
    orderConfirmation.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    // ======================================================================
    // 6) 저장 실패 시 처리
    // ======================================================================
    console.error('주문 저장 실패 에러 상세:', error);
    alert('주문 저장에 실패했어요');
  } finally {
    // ======================================================================
    // 7) 처리 완료 후 버튼 원상 복구
    // ======================================================================
    submitBtn.disabled = false;
    submitBtn.textContent = '주문하기';
  }
});

// ==========================================================================
// 9. 다시 작성 (reset) 이벤트 처리
// ==========================================================================
// [조건] 다시 작성 버튼은 주문서만 초기화하고 주문 내역(orders)은 지우지 않습니다.
orderForm.addEventListener('reset', function () {
  setTimeout(() => {
    const sizeMRadio = document.getElementById('size-m');
    if (sizeMRadio) {
      sizeMRadio.checked = true;
    }

    quantityInput.value = '1';
    calculateTotal();

    orderConfirmation.textContent = '';
    orderConfirmation.style.display = 'none';
    orderConfirmation.classList.add('hidden');
  }, 0);
});

// ==========================================================================
// 10. 주문 내역 모두 지우기 버튼 처리
// ==========================================================================
clearAllOrdersBtn.addEventListener('click', function () {
  if (orders.length === 0) return;

  const isConfirmed = confirm('모든 주문 내역을 삭제하시겠습니까?');
  if (isConfirmed) {
    orders.length = 0;
    renderOrders();
  }
});

// ==========================================================================
// 11. 초기 상태 실행
// ==========================================================================
calculateTotal();
renderOrders();
