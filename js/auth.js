// Valhalla Barbearia - Client authentication

let loggedClient = null;

// --- Init auth on page load ---
function initAuth() {
  const saved = localStorage.getItem('vb_client');
  if (saved) {
    try {
      loggedClient = JSON.parse(saved);
      refreshClientData(loggedClient.phone);
    } catch (e) {
      localStorage.removeItem('vb_client');
    }
  }
}

// --- Refresh client data from DB ---
async function refreshClientData(phone) {
  const { data } = await db.from('valhalla_clients')
    .select('*')
    .eq('phone', phone)
    .single();

  if (data) {
    loggedClient = data;
    localStorage.setItem('vb_client', JSON.stringify(data));
    showLoggedInState(data);

    // Check for unseen completions → celebration!
    if (data.unseen_completions > 0) {
      showCelebration(data);
      await db.rpc('mark_completions_seen', { p_phone: phone });
      data.unseen_completions = 0;
      // Subscribe realtime for future updates
      subscribeRealtime(phone);
    } else {
      subscribeRealtime(phone);
    }
  }
}

// --- UI States ---
function showLoggedInState(client) {
  document.getElementById('auth-logged-out').classList.add('hidden');
  document.getElementById('auth-logged-in').classList.remove('hidden');
  document.getElementById('auth-user-name').textContent = client.name.split(' ')[0];
  document.getElementById('auth-stamps-badge').textContent = `${client.loyalty_stamps || 0}/10 selos`;

  // Auto-fill booking form
  const nameInput = document.getElementById('client-name');
  const phoneInput = document.getElementById('client-phone');
  if (nameInput && !nameInput.value) nameInput.value = client.name;
  if (phoneInput && !phoneInput.value) phoneInput.value = client.phone;

  // Auto-fill order form
  const orderName = document.getElementById('order-name');
  const orderPhone = document.getElementById('order-phone');
  if (orderName && !orderName.value) orderName.value = client.name;
  if (orderPhone && !orderPhone.value) orderPhone.value = client.phone;

  // Auto-fill loyalty phone
  const loyaltyPhone = document.getElementById('loyalty-phone');
  if (loyaltyPhone) loyaltyPhone.value = client.phone;

  // Auto-fill lookup phone
  const lookupPhone = document.getElementById('lookup-phone');
  if (lookupPhone) lookupPhone.value = client.phone;
}

function showLoggedOutState() {
  document.getElementById('auth-logged-out').classList.remove('hidden');
  document.getElementById('auth-logged-in').classList.add('hidden');
}

// --- Auth Modal ---
function showAuthModal(form) {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthForm(form);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-login-error').classList.add('hidden');
  document.getElementById('auth-reg-error').classList.add('hidden');
}

function switchAuthForm(form) {
  document.getElementById('auth-login-form').classList.toggle('hidden', form !== 'login');
  document.getElementById('auth-register-form').classList.toggle('hidden', form !== 'register');
  document.getElementById('auth-login-error').classList.add('hidden');
  document.getElementById('auth-reg-error').classList.add('hidden');
}

// --- Login ---
async function doClientLogin() {
  const phone = document.getElementById('auth-login-phone').value.trim();
  const pin = document.getElementById('auth-login-pin').value.trim();
  const errorEl = document.getElementById('auth-login-error');

  if (!phone || !pin) {
    errorEl.textContent = 'Preencha telefone e PIN';
    errorEl.classList.remove('hidden');
    return;
  }

  const { data, error } = await db.rpc('login_client', {
    p_phone: phone,
    p_pin: pin
  });

  if (error || data?.error) {
    errorEl.textContent = data?.error || 'Erro ao entrar';
    errorEl.classList.remove('hidden');
    return;
  }

  loggedClient = data.client;
  localStorage.setItem('vb_client', JSON.stringify(data.client));
  showLoggedInState(data.client);
  closeAuthModal();

  // Check celebrations
  if (data.client.unseen_completions > 0) {
    showCelebration(data.client);
    await db.rpc('mark_completions_seen', { p_phone: phone });
  }

  subscribeRealtime(phone);
}

// --- Register ---
async function doClientRegister() {
  const name = document.getElementById('auth-reg-name').value.trim();
  const phone = document.getElementById('auth-reg-phone').value.trim();
  const pin = document.getElementById('auth-reg-pin').value.trim();
  const errorEl = document.getElementById('auth-reg-error');

  if (!name || !phone || !pin) {
    errorEl.textContent = 'Preencha todos os campos';
    errorEl.classList.remove('hidden');
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    errorEl.textContent = 'PIN deve ter 4 digitos numericos';
    errorEl.classList.remove('hidden');
    return;
  }

  const { data, error } = await db.rpc('register_client', {
    p_name: name,
    p_phone: phone,
    p_pin: pin
  });

  if (error || data?.error) {
    errorEl.textContent = data?.error || 'Erro ao registrar';
    errorEl.classList.remove('hidden');
    return;
  }

  loggedClient = data.client;
  localStorage.setItem('vb_client', JSON.stringify(data.client));
  showLoggedInState(data.client);
  closeAuthModal();
  subscribeRealtime(phone);
}

// --- Logout ---
function clientLogout() {
  loggedClient = null;
  localStorage.removeItem('vb_client');
  showLoggedOutState();

  // Clear form fields
  document.getElementById('client-name').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('loyalty-phone').value = '';
  document.getElementById('lookup-phone').value = '';
  document.getElementById('loyalty-card-container').innerHTML = '';

  // Unsubscribe realtime
  if (loyaltyChannel) {
    db.removeChannel(loyaltyChannel);
    loyaltyChannel = null;
  }
}

// --- Init on load ---
initAuth();
