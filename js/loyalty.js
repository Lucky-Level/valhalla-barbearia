// Valhalla Barbearia - Loyalty card, confetti, realtime & frequency

let loyaltyClient = null;
let loyaltyChannel = null;

// --- Loyalty Card ---
async function loadLoyaltyCard() {
  const phone = document.getElementById('loyalty-phone').value.trim();
  if (!phone) return;

  // Unsubscribe previous channel
  if (loyaltyChannel) {
    db.removeChannel(loyaltyChannel);
    loyaltyChannel = null;
  }

  const { data } = await db.from('valhalla_clients')
    .select('*')
    .eq('phone', phone)
    .single();

  const container = document.getElementById('loyalty-card-container');

  if (!data) {
    container.innerHTML = `
      <div class="card" style="text-align:center; margin-top: 16px;">
        <p class="empty-state">Nenhum registro encontrado para este telefone.</p>
        <p style="color: var(--text-muted); font-size: 0.8rem;">O cartao fidelidade e ativado automaticamente apos seu primeiro corte concluido.</p>
      </div>`;
    return;
  }

  loyaltyClient = data;

  // Check for unseen completions → celebration
  if (data.unseen_completions > 0) {
    showCelebration(data);
    await db.rpc('mark_completions_seen', { p_phone: phone });
    data.unseen_completions = 0;
  }

  renderLoyaltyCard(data);

  // Subscribe to realtime updates
  subscribeRealtime(phone);
}

// --- Realtime Subscription ---
function subscribeRealtime(phone) {
  loyaltyChannel = db.channel('loyalty-' + phone.replace(/\D/g, ''))
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'valhalla_clients',
      filter: `phone=eq.${phone}`
    }, async (payload) => {
      const updated = payload.new;
      if (updated.unseen_completions > 0) {
        loyaltyClient = updated;
        showCelebration(updated);
        renderLoyaltyCard(updated);
        await db.rpc('mark_completions_seen', { p_phone: phone });
      }
    })
    .subscribe();
}

// --- Render Card ---
function renderLoyaltyCard(client) {
  const container = document.getElementById('loyalty-card-container');
  const stamps = client.loyalty_stamps;

  // 2 rows of 5
  let row1 = '', row2 = '';
  for (let i = 0; i < 5; i++) {
    row1 += i < stamps
      ? `<div class="stamp filled">&#10003;</div>`
      : `<div class="stamp">${i + 1}</div>`;
  }
  for (let i = 5; i < 10; i++) {
    row2 += i < stamps
      ? `<div class="stamp filled">&#10003;</div>`
      : `<div class="stamp">${i + 1}</div>`;
  }

  const pct = (stamps / 10) * 100;

  const redeemedHTML = client.loyalty_redeemed > 0
    ? `<div class="loyalty-redeemed">&#9733; ${client.loyalty_redeemed} corte${client.loyalty_redeemed > 1 ? 's' : ''} gratis resgatado${client.loyalty_redeemed > 1 ? 's' : ''}!</div>`
    : '';

  const freqText = client.haircut_frequency_days
    ? `A cada ${client.haircut_frequency_days} dias`
    : 'Nao informada';

  container.innerHTML = `
    <div class="loyalty-card" style="margin-top: 16px;">
      <div class="lc-stripe"></div>
      <div class="lc-header">
        <div class="lc-brand">
          <div class="lc-title">Valhalla Barbearia</div>
          <div class="lc-subtitle">Cartao Fidelidade</div>
        </div>
        <div class="lc-badge">&#9986;</div>
      </div>
      <div class="loyalty-stamps-grid">
        <div class="loyalty-stamps-row">${row1}</div>
        <div class="loyalty-stamps-row">${row2}</div>
      </div>
      <div class="loyalty-progress">
        <div class="loyalty-progress-bar" style="width: ${pct}%"></div>
      </div>
      <div class="loyalty-counter">${stamps}/10 cortes</div>
      <div class="loyalty-reward">10 cortes = 1 corte gratis</div>
      ${redeemedHTML}
      <div class="loyalty-footer">
        <span>Visitas: ${client.total_visits}</span>
        <span>Frequencia: ${freqText}</span>
      </div>
    </div>`;
}

// --- Celebration (confetti + thank you) ---
function showCelebration(client) {
  const overlay = document.getElementById('celebration-overlay');
  const title = document.getElementById('celeb-title');
  const msg = document.getElementById('celeb-message');
  const firstName = client.name.split(' ')[0];

  if (client.loyalty_redeemed > 0 && client.loyalty_stamps === 0) {
    title.textContent = `Parabens, ${firstName}!`;
    msg.textContent = 'Voce completou o cartao! Seu proximo corte e GRATIS!';
  } else if (client.unseen_completions > 1) {
    title.textContent = `Obrigado, ${firstName}!`;
    msg.textContent = `Voce tem ${client.unseen_completions} novos selos no seu cartao fidelidade!`;
  } else {
    title.textContent = `Obrigado, ${firstName}!`;
    msg.textContent = 'Seu corte foi concluido. Mais um selo no seu cartao fidelidade!';
  }

  overlay.classList.remove('hidden');
  launchConfetti();
}

function closeCelebration() {
  document.getElementById('celebration-overlay').classList.add('hidden');

  // Ask frequency if not set
  if (loyaltyClient && !loyaltyClient.haircut_frequency_days) {
    document.getElementById('freq-overlay').classList.remove('hidden');
  }
}

// --- Frequency ---
async function setFrequency(days) {
  if (!loyaltyClient) return;
  await db.rpc('set_haircut_frequency', {
    p_phone: loyaltyClient.phone,
    p_days: days
  });
  loyaltyClient.haircut_frequency_days = days;
  document.getElementById('freq-overlay').classList.add('hidden');
  renderLoyaltyCard(loyaltyClient);
}

function skipFrequency() {
  document.getElementById('freq-overlay').classList.add('hidden');
}

// --- Confetti Animation ---
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.classList.remove('hidden');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#C9A96E', '#e8d5b5', '#ffd700', '#4caf50', '#3A4A32', '#8A9680', '#ffffff'];
  const particles = [];

  for (let i = 0; i < 180; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.6,
      w: Math.random() * 12 + 4,
      h: Math.random() * 8 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 5,
      vy: Math.random() * 2 + 1.5,
      rot: Math.random() * 360,
      rotSpd: (Math.random() - 0.5) * 12,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpd: Math.random() * 0.1 + 0.03
    });
  }

  let frame = 0;
  const maxFrames = 240;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = frame < maxFrames * 0.7 ? 1 : Math.max(0, 1 - (frame - maxFrames * 0.7) / (maxFrames * 0.3));
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();

      p.x += p.vx + Math.sin(p.wobble) * 0.8;
      p.y += p.vy;
      p.vy += 0.04;
      p.rot += p.rotSpd;
      p.wobble += p.wobbleSpd;
    });

    frame++;
    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.add('hidden');
    }
  }

  animate();
}
