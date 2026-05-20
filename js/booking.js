// Valhalla Barbearia - Client-side booking logic
const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let currentStep = 1;

const state = {
  services: [],
  selectedService: null,
  selectedDate: null,
  selectedTime: null,
  currentMonth: new Date(),
  availableDates: [],
  appointments: []
};

// --- Main tab switching (shared) ---
function switchMainTab(tab) {
  document.querySelectorAll('#main-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.getElementById('tab-booking').classList.toggle('hidden', tab !== 'booking');
  document.getElementById('tab-my-booking').classList.toggle('hidden', tab !== 'my-booking');
  document.getElementById('tab-fidelidade').classList.toggle('hidden', tab !== 'fidelidade');

  if (tab === 'my-booking') {
    document.getElementById('my-bookings-list').innerHTML = '';
    document.getElementById('my-bookings-empty').classList.add('hidden');
  }
}

// --- Init ---
async function init() {
  const { data } = await db.from('valhalla_services').select('*');
  state.services = data || [];
  renderServices();
  // Set initial history state
  history.replaceState({ step: 1 }, '', '');
}

// --- History-based navigation ---
window.addEventListener('popstate', (e) => {
  const step = e.state?.step || 1;
  if (step === 'success') return;
  showStep(step);
});

function navigateBack() {
  history.back();
}

function showStep(n) {
  if (typeof n !== 'number' || n < 1 || n > 4) n = 1;
  currentStep = n;

  // Ensure booking tab is visible
  switchMainTab('booking');

  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step-${i}`).classList.toggle('hidden', i !== n);
  }
  document.getElementById('step-success').classList.add('hidden');
  document.querySelector('.steps').classList.remove('hidden');
  document.querySelectorAll('.step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });

  // Re-render calendar when going back to step 2
  if (n === 2 && state.selectedService) {
    renderCalendar();
  }
  // Re-render time slots when going back to step 3
  if (n === 3 && state.selectedDate) {
    loadTimeSlots();
  }
}

function goToStep(n) {
  history.pushState({ step: n }, '', '');
  showStep(n);
}

// --- Step 1: Services ---
function renderServices() {
  const container = document.getElementById('services-container');
  container.innerHTML = state.services.map(s => `
    <button class="service-btn" data-id="${s.id}" onclick="selectService('${s.id}')">
      <span class="name">${s.name}</span>
      <span class="duration">${s.duration_minutes} min</span>
    </button>
  `).join('');
}

function selectService(id) {
  state.selectedService = state.services.find(s => s.id === id);
  document.querySelectorAll('.service-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
  state.selectedDate = null;
  state.selectedTime = null;
  loadMonth();
  goToStep(2);
}

// --- Step 2: Calendar ---
async function loadMonth() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const from = firstDay.toISOString().split('T')[0];
  const to = lastDay.toISOString().split('T')[0];

  const { data } = await db
    .from('valhalla_availability')
    .select('date')
    .gte('date', from)
    .lte('date', to);

  state.availableDates = [...new Set((data || []).map(a => a.date))];
  renderCalendar();
}

function renderCalendar() {
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const months = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  document.getElementById('month-label').textContent = `${months[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0

  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
  let html = days.map(d => `<div class="day-label">${d}</div>`).join('');

  for (let i = 0; i < startDow; i++) {
    html += '<div class="date-cell empty"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(year, month, d);
    const isPast = dateObj < today;
    const isAvailable = state.availableDates.includes(dateStr) && !isPast;
    const isToday = dateObj.getTime() === today.getTime();
    const isSelected = state.selectedDate === dateStr;

    const classes = [
      'date-cell',
      isAvailable ? 'available' : 'unavailable',
      isToday ? 'today' : '',
      isSelected ? 'selected' : ''
    ].filter(Boolean).join(' ');

    const onclick = isAvailable ? `onclick="selectDate('${dateStr}')"` : '';
    html += `<div class="${classes}" ${onclick}>${d}</div>`;
  }

  document.getElementById('calendar').innerHTML = html;
}

document.getElementById('prev-month').addEventListener('click', () => {
  state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
  loadMonth();
});

document.getElementById('next-month').addEventListener('click', () => {
  state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
  loadMonth();
});

async function selectDate(dateStr) {
  state.selectedDate = dateStr;
  state.selectedTime = null;
  renderCalendar();
  await loadTimeSlots();
  goToStep(3);
}

// --- Step 3: Time slots ---
async function loadTimeSlots() {
  const { data: blocks } = await db
    .from('valhalla_availability')
    .select('*')
    .eq('date', state.selectedDate);

  const { data: apts } = await db
    .from('valhalla_appointments')
    .select('start_time, end_time')
    .eq('date', state.selectedDate)
    .eq('status', 'confirmed');

  state.appointments = apts || [];

  const service = state.selectedService;
  const slotDuration = service.duration_minutes;
  const interval = service.interval_minutes;
  const slots = [];

  (blocks || []).forEach(block => {
    const startMin = timeToMinutes(block.start_time);
    const endMin = timeToMinutes(block.end_time);

    for (let t = startMin; t + slotDuration <= endMin; t += slotDuration + interval) {
      const timeStr = minutesToTime(t);
      const endStr = minutesToTime(t + slotDuration);
      const isBooked = state.appointments.some(apt => {
        const aptStart = timeToMinutes(apt.start_time);
        const aptEnd = timeToMinutes(apt.end_time);
        return t < aptEnd + interval && t + slotDuration > aptStart - interval;
      });
      slots.push({ time: timeStr, end: endStr, booked: isBooked });
    }
  });

  const container = document.getElementById('time-slots');
  const noSlots = document.getElementById('no-slots');

  if (slots.length === 0) {
    container.innerHTML = '';
    noSlots.classList.remove('hidden');
    return;
  }

  noSlots.classList.add('hidden');
  container.innerHTML = slots.map(s => {
    const cls = s.booked ? 'time-slot booked' : 'time-slot';
    const onclick = s.booked ? '' : `onclick="selectTime('${s.time}', '${s.end}')"`;
    return `<div class="${cls}" ${onclick} data-time="${s.time}">${s.time}</div>`;
  }).join('');
}

function selectTime(time, end) {
  state.selectedTime = { start: time, end: end };
  document.querySelectorAll('.time-slot').forEach(el => {
    el.classList.toggle('selected', el.dataset.time === time);
  });

  const service = state.selectedService;
  const dateParts = state.selectedDate.split('-');
  const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  document.getElementById('sum-service').textContent = `${service.name} (${service.duration_minutes} min)`;
  document.getElementById('sum-date').textContent = dateFormatted;
  document.getElementById('sum-time').textContent = time;

  goToStep(4);
  updateConfirmBtn();
}

// --- Step 4: Confirm ---
function updateConfirmBtn() {
  const name = document.getElementById('client-name').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  document.getElementById('confirm-btn').disabled = !(name && phone && state.selectedTime);
}

document.getElementById('client-name').addEventListener('input', updateConfirmBtn);
document.getElementById('client-phone').addEventListener('input', updateConfirmBtn);

document.getElementById('confirm-btn').addEventListener('click', async () => {
  const btn = document.getElementById('confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Agendando...';

  const name = document.getElementById('client-name').value.trim();
  const phone = document.getElementById('client-phone').value.trim();

  const { error } = await db.from('valhalla_appointments').insert({
    service_id: state.selectedService.id,
    date: state.selectedDate,
    start_time: state.selectedTime.start,
    end_time: state.selectedTime.end,
    client_name: name,
    client_phone: phone
  });

  if (error) {
    btn.textContent = 'Erro! Tente novamente';
    btn.disabled = false;
    console.error(error);
    return;
  }

  showSuccess(name, phone);
});

function showSuccess(name, phone) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step-${i}`).classList.add('hidden');
  }
  document.querySelector('.steps').classList.add('hidden');

  const dateParts = state.selectedDate.split('-');
  const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  document.getElementById('success-details').textContent =
    `${state.selectedService.name} - ${dateFormatted} as ${state.selectedTime.start}`;

  const msg = CONFIG.WHATSAPP_MESSAGE
    .replace('{name}', name)
    .replace('{phone}', phone)
    .replace('{service}', state.selectedService.name)
    .replace('{date}', dateFormatted)
    .replace('{time}', state.selectedTime.start);

  const waUrl = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  const waBtn = document.getElementById('whatsapp-btn');
  waBtn.onclick = () => window.open(waUrl, '_blank');

  document.getElementById('step-success').classList.remove('hidden');

  // Push a "success" state so back goes to step 1 clean
  history.pushState({ step: 'success' }, '', '');
}

// --- Utils ---
function timeToMinutes(t) {
  const parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToTime(m) {
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const min = String(m % 60).padStart(2, '0');
  return `${h}:${min}`;
}

// Start
init();
