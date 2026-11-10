/* app.js - TODO front-end: talks to api.php (PHP + MySQL) */
const $ = (s) => document.querySelector(s);
const esc = (v = '') => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

let tasks = [];
let filter = 'all';

/* ---------- Talk to the server ---------- */
async function api(action, data) {
  const options = data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {};
  let result;
  let response;
  try {
    response = await fetch('api.php?action=' + action, options);
    result = await response.json();
  } catch (error) {
    throw new Error('Cannot reach the server. Open http://localhost/todo/ and start Apache + MySQL in XAMPP.');
  }
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

const statusOf = (p) => (p >= 100 ? 'Complete' : p <= 0 ? 'Not started' : p + '% done');
const groupOf = (p) => (p >= 100 ? 'done' : p <= 0 ? 'new' : 'doing');

/* ---------- Intro and login / register screens ---------- */
const intro = $('#intro');
const skipIntro = () => intro.classList.add('done');
intro.addEventListener('click', skipIntro);
setTimeout(skipIntro, 3600);

function showTab(login) {
  $('#login-form').hidden = !login;
  $('#register-form').hidden = login;
  $('#tab-login').classList.toggle('active', login);
  $('#tab-register').classList.toggle('active', !login);
  $('#auth-msg').textContent = '';
}
$('#tab-login').addEventListener('click', () => showTab(true));
$('#tab-register').addEventListener('click', () => showTab(false));

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('login', { email: $('#l-email').value, password: $('#l-pass').value });
    showApp(r.name);
  } catch (err) { $('#auth-msg').textContent = err.message; }
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('register', { name: $('#r-name').value, email: $('#r-email').value, password: $('#r-pass').value });
    showApp(r.name);
  } catch (err) { $('#auth-msg').textContent = err.message; }
});

$('#logout').addEventListener('click', async () => {
  await api('logout', {});
  location.reload();
});

function showApp(name) {
  document.body.classList.add('in');
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#hello').textContent = 'Hi, ' + name + '!';
  loadTasks();
}

/* ---------- Tasks ---------- */
async function loadTasks() {
  try {
    tasks = await api('list');
    render();
  } catch (err) { toast(err.message); }
}

function render() {
  // Overall progress = average of all task percents
  const total = tasks.length;
  const overall = total ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / total) : 0;
  $('#ring').style.strokeDashoffset = 326.7 * (1 - overall / 100);
  $('#overall').textContent = overall + '%';
  $('#c-done').textContent = tasks.filter((t) => groupOf(t.progress) === 'done').length;
  $('#c-doing').textContent = tasks.filter((t) => groupOf(t.progress) === 'doing').length;
  $('#c-new').textContent = tasks.filter((t) => groupOf(t.progress) === 'new').length;

  const shown = tasks.filter((t) => filter === 'all' || groupOf(t.progress) === filter);
  if (shown.length === 0) {
    $('#list').innerHTML = '<p class="empty">' + (total ? 'No tasks in this group.' : 'No tasks yet. Add your first one!') + '</p>';
    return;
  }

  $('#list').innerHTML = shown.map((t, i) => `
    <article class="task ${t.progress >= 100 ? 'complete' : ''}" style="--d:${Math.min(i, 8) * 60}ms">
      <h4>${esc(t.title)}</h4>
      ${t.notes ? `<p>${esc(t.notes)}</p>` : ''}
      <div class="meta"><span data-label="${t.id}">${statusOf(t.progress)}</span><span>${t.progress}%</span></div>
      <div class="meter"><i style="width:${t.progress}%"></i></div>
      <input type="range" min="0" max="100" step="5" value="${t.progress}" data-id="${t.id}" aria-label="Progress" />
      <div class="row">
        <button type="button" class="btn small ghost" data-edit="${t.id}">Edit</button>
        <button type="button" class="btn small ghost" data-del="${t.id}">Delete</button>
      </div>
    </article>
  `).join('');
}

// Filter chips
$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  filter = chip.dataset.f;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  render();
});

// Slider on a task: live label, then save on release
$('#list').addEventListener('input', (e) => {
  if (e.target.matches('input[type=range]')) {
    const label = document.querySelector(`[data-label="${e.target.dataset.id}"]`);
    if (label) label.textContent = statusOf(Number(e.target.value));
  }
});
$('#list').addEventListener('change', async (e) => {
  if (!e.target.matches('input[type=range]')) return;
  const task = tasks.find((t) => t.id == e.target.dataset.id);
  if (!task) return;
  try {
    await api('update', { ...task, progress: Number(e.target.value) });
    await loadTasks();
    toast(Number(e.target.value) >= 100 ? 'Task complete! 🎉' : 'Progress saved');
  } catch (err) { toast(err.message); }
});

// Edit and Delete buttons
$('#list').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) {
    const t = tasks.find((x) => x.id == edit.dataset.edit);
    $('#task-id').value = t.id;
    $('#t-title').value = t.title;
    $('#t-notes').value = t.notes;
    $('#t-progress').value = t.progress;
    $('#t-out').textContent = t.progress + '%';
    $('#form-title').textContent = 'Edit task';
    $('#save-btn').textContent = 'Update task';
    $('#cancel-btn').hidden = false;
    $('#task-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (del && confirm('Delete this task?')) {
    try {
      await api('delete', { id: Number(del.dataset.del) });
      await loadTasks();
      toast('Task deleted');
    } catch (err) { toast(err.message); }
  }
});

// Add / update form
function resetForm() {
  $('#task-form').reset();
  $('#task-id').value = '';
  $('#t-out').textContent = '0%';
  $('#form-title').textContent = 'Add a task';
  $('#save-btn').textContent = 'Add task';
  $('#cancel-btn').hidden = true;
}
$('#cancel-btn').addEventListener('click', resetForm);
$('#t-progress').addEventListener('input', (e) => { $('#t-out').textContent = e.target.value + '%'; });

$('#task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = Number($('#task-id').value);
  const data = { id, title: $('#t-title').value, notes: $('#t-notes').value, progress: Number($('#t-progress').value) };
  try {
    await api(id ? 'update' : 'add', data);
    resetForm();
    await loadTasks();
    toast(id ? 'Task updated' : 'Task added');
  } catch (err) { toast(err.message); }
});

/* ---------- Start: if already logged in, go straight to the homepage ---------- */
(async () => {
  try {
    const r = await api('me');
    if (r.name) showApp(r.name);
  } catch (err) { $('#auth-msg').textContent = err.message; }
})();