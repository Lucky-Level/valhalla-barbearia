// Valhalla Barbearia - Shop carousel & Client Cancellation
// switchMainTab is defined in booking.js (loaded first)

let selectedProduct = null;

// --- Products Carousel (loads on init) ---
async function loadProductsCarousel() {
  const { data } = await db.from('valhalla_products')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  const carousel = document.getElementById('products-carousel');
  const section = document.getElementById('products-carousel-section');

  if (!data || data.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  window._products = data;

  carousel.innerHTML = data.map(p => `
    <div class="carousel-card" onclick="openOrderModal('${p.id}')">
      ${p.image_url
        ? `<img src="${p.image_url}" alt="${p.name}">`
        : `<div class="placeholder-img">&#9670;</div>`
      }
      <div class="card-info">
        <div class="card-name">${p.name}</div>
        <div class="card-price">${Number(p.price).toFixed(2)} R$</div>
      </div>
    </div>
  `).join('');
}

// --- Order Modal ---
function openOrderModal(productId) {
  selectedProduct = window._products.find(p => p.id === productId);
  if (!selectedProduct) return;

  document.getElementById('order-modal').classList.remove('hidden');

  document.getElementById('order-product-detail').innerHTML = `
    ${selectedProduct.image_url ? `<img src="${selectedProduct.image_url}" alt="${selectedProduct.name}" class="product-img-large">` : ''}
    <h3 style="color: var(--accent); margin: 12px 0 4px;">${selectedProduct.name}</h3>
    <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px;">${Number(selectedProduct.price).toFixed(2)} R$</p>
    ${selectedProduct.description ? `<p style="color: var(--text-muted); font-size: 0.85rem;">${selectedProduct.description}</p>` : ''}
  `;
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.add('hidden');
}

async function submitOrder() {
  const name = document.getElementById('order-name').value.trim();
  const phone = document.getElementById('order-phone').value.trim();

  if (!name || !phone) {
    alert('Preencha nome e telefone');
    return;
  }

  const { error } = await db.from('valhalla_orders').insert({
    product_id: selectedProduct.id,
    client_name: name,
    client_phone: phone
  });

  if (error) {
    alert('Erro ao encomendar. Tente novamente.');
    console.error(error);
    return;
  }

  document.getElementById('order-modal').classList.add('hidden');
  document.getElementById('order-success').classList.remove('hidden');

  const msg = `Oi, encomendei: ${selectedProduct.name} (${Number(selectedProduct.price).toFixed(2)} R$). Pago no dia do corte. - ${name}, ${phone}`;
  const waUrl = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  document.getElementById('order-wa-btn').onclick = () => window.open(waUrl, '_blank');
}

function closeOrderSuccess() {
  document.getElementById('order-success').classList.add('hidden');
}

// --- Client Cancellation ---
async function lookupBooking() {
  const phone = document.getElementById('lookup-phone').value.trim();
  if (!phone) return;

  const { data } = await db.from('valhalla_appointments')
    .select('*, valhalla_services(name)')
    .eq('client_phone', phone)
    .eq('status', 'confirmed')
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true });

  const container = document.getElementById('my-bookings-list');
  const empty = document.getElementById('my-bookings-empty');

  if (!data || data.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = data.map(apt => {
    const dateParts = apt.date.split('-');
    const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    const time = apt.start_time.slice(0, 5);

    return `
      <div class="card" style="margin-top: 12px;">
        <div class="summary">
          <div class="summary-row">
            <span class="label">Servico</span>
            <span>${apt.services?.name || 'Corte'}</span>
          </div>
          <div class="summary-row">
            <span class="label">Data</span>
            <span>${dateFormatted}</span>
          </div>
          <div class="summary-row">
            <span class="label">Horario</span>
            <span>${time}</span>
          </div>
        </div>
        <button class="btn btn-danger" onclick="clientCancel('${apt.id}', '${phone}')">Cancelar agendamento</button>
      </div>
    `;
  }).join('');
}

async function clientCancel(aptId, phone) {
  if (!confirm('Tem certeza que deseja cancelar? Voce so pode cancelar 1 vez.')) return;

  const { data, error } = await db.rpc('client_cancel_appointment', {
    apt_id: aptId,
    phone: phone
  });

  if (error) {
    alert('Erro ao cancelar. Tente novamente.');
    console.error(error);
    return;
  }

  if (data?.error) {
    alert(data.error);
    return;
  }

  alert('Agendamento cancelado com sucesso.');
  lookupBooking();
}

// Load carousel on page load
loadProductsCarousel();
