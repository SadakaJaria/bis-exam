
const LS_KEY = "bis_progress_v1";

let bank = null;
let state = null;
let tick = null;

const $ = (id) => document.getElementById(id);

function nowISO(){ return new Date().toISOString(); }

function loadProgress(){
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {coverage:{}, history:[]}; }
  catch { return {coverage:{}, history:[]}; }
}
function saveProgress(p){ localStorage.setItem(LS_KEY, JSON.stringify(p)); }

function shuffle(arr){
  for (let i = arr.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Coverage: لكل محاضرة نحفظ مؤشر دوران على قائمة الأسئلة
function pickWithCoverage(allIds, lectureKey, n, doShuffle){
  const prog = loadProgress();
  prog.coverage[lectureKey] ??= {idx:0, order: allIds.slice()};
  let cov = prog.coverage[lectureKey];

  if (cov.order.length !== allIds.length){
    cov.order = allIds.slice();
    cov.idx = 0;
  }

  if (doShuffle && cov.idx === 0) shuffle(cov.order);

  const picked = [];
  for (let k=0; k<n; k++){
    picked.push(cov.order[cov.idx]);
    cov.idx = (cov.idx + 1) % cov.order.length;
    if (cov.idx === 0 && doShuffle) shuffle(cov.order);
  }

  saveProgress(prog);
  return picked;
}

function formatTime(sec){
  const m = Math.floor(sec/60).toString().padStart(2,"0");
  const s = Math.floor(sec%60).toString().padStart(2,"0");
  return `${m}:${s}`;
}

async function init(){
  $("sub").textContent = "تحميل بنك الأسئلة...";
  const res = await fetch("questions.json");
  bank = await res.json();

  const lects = bank.meta.lectures;
  const sel = $("lectureSel");
  sel.innerHTML = `<option value="ALL">كل المنهج</option>` + lects.map(l=>`<option value="${l}">المحاضرة ${parseInt(l.replace('L',''),10)}</option>`).join("");

  $("startBtn").onclick = startExam;
  $("resetBtn").onclick = () => { localStorage.removeItem(LS_KEY); alert("تم مسح التتبع."); };

  renderSetupStats();
}

function renderSetupStats(){
  const total = bank.questions.length;
  $("sub").textContent = `إجمالي الأسئلة: ${total} • محاضرات: ${bank.meta.lectures.length} • يعمل أوفلاين بعد أول فتح`;
}

function getPool(lecture){
  if (lecture === "ALL") return bank.questions;
  return bank.questions.filter(q => q.lecture === lecture);
}

function shuffledOptions(q){
  const entries = Object.entries(q.options);
  shuffle(entries);
  return entries.map(([key, text]) => ({key, text}));
}

function startExam(){
  const lecture = $("lectureSel").value;
  const n = Math.max(1, parseInt($("countInp").value || "1", 10));
  const minutes = parseInt($("timeSel").value, 10);
  const doShuffleQ = $("shuffleQ").checked;
  const doShuffleO = $("shuffleO").checked;

  const pool = getPool(lecture);
  if (!pool.length){ alert("ما في أسئلة للمحاضرة المختارة."); return; }

  const ids = pool.map(q=>q.id);
  const take = Math.min(n, ids.length);
  const pickIds = pickWithCoverage(ids, lecture, take, doShuffleQ);
  const picked = pickIds.map(id => bank.questions.find(q=>q.id===id));

  state = {
    lecture,
    minutes,
    timeLeft: minutes*60,
    i: 0,
    picked,
    answers: {},
    optOrder: {},
    startedAt: nowISO(),
    doShuffleO
  };

  for (const q of picked){
    state.optOrder[q.id] = doShuffleO ? shuffledOptions(q) : Object.entries(q.options).map(([key,text])=>({key,text}));
  }

  $("setup").style.display = "none";
  $("result").style.display = "none";
  $("exam").style.display = "block";

  $("pillLecture").textContent = lecture === "ALL" ? "كل المنهج" : `المحاضرة ${parseInt(lecture.replace('L',''),10)}`;
  $("hint").textContent = "اختَر إجابة ثم التالي. يمكنك الرجوع للسابق.";
  $("prevBtn").onclick = () => nav(-1);
  $("nextBtn").onclick = () => nav(+1);
  $("finishBtn").onclick = () => finishExam(false);

  renderQuestion();
  startTimer();
}

function startTimer(){
  clearInterval(tick);
  $("timer").textContent = formatTime(state.timeLeft);
  tick = setInterval(()=>{
    state.timeLeft--;
    $("timer").textContent = formatTime(state.timeLeft);
    if (state.timeLeft <= 0){
      clearInterval(tick);
      finishExam(true);
    }
  }, 1000);
}

function nav(delta){
  const ni = state.i + delta;
  if (ni < 0 || ni >= state.picked.length) return;
  state.i = ni;
  renderQuestion();
}

function renderQuestion(){
  const q = state.picked[state.i];
  $("pillProg").textContent = `${state.i+1} / ${state.picked.length}`;
  $("qText").textContent = q.question;

  const chosen = state.answers[q.id];
  const opts = state.optOrder[q.id];

  $("opts").innerHTML = opts.map(o=>{
    const cls = (chosen === o.key) ? "opt sel" : "opt";
    return `<div class="${cls}" data-k="${o.key}"><b>${o.key})</b> ${escapeHtml(o.text)}</div>`;
  }).join("");

  [...$("opts").children].forEach(div=>{
    div.onclick = () => {
      const k = div.getAttribute("data-k");
      state.answers[q.id] = k;
      renderQuestion();
    };
  });
}

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function grade(picked, answers){
  let correct=0, answered=0;
  const wrong = [];
  const perLecture = {};

  for (const q of picked){
    const a = answers[q.id];
    perLecture[q.lecture] ??= {wrong:[], totalAnswered:0, totalCorrect:0};
    if (a){
      answered++;
      perLecture[q.lecture].totalAnswered++;
      if (a === q.correct){
        correct++;
        perLecture[q.lecture].totalCorrect++;
      } else {
        wrong.push(q);
        perLecture[q.lecture].wrong.push(q);
      }
    }
  }
  const pct = answered ? Math.round((correct/answered)*100) : 0;
  return {correct, answered, pct, wrong, perLecture};
}

function recordHistory(summary){
  const prog = loadProgress();
  prog.history.push(summary);
  if (prog.history.length > 200) prog.history = prog.history.slice(-200);
  saveProgress(prog);
}

function finishExam(timeout=false){
  clearInterval(tick);

  const {correct, answered, pct, wrong, perLecture} = grade(state.picked, state.answers);

  recordHistory({
    at: nowISO(),
    lecture: state.lecture,
    minutes: state.minutes,
    answered, correct, pct,
    wrongCount: wrong.length
  });

  const total = state.picked.length;
  const unanswered = total - answered;

  const wrongIds = wrong.map(q=>q.id);

  $("exam").style.display = "none";
  const r = $("result");
  r.style.display = "block";

  const perLectHTML = Object.entries(perLecture).map(([lec, s])=>{
    const w = s.wrong.length;
    const a = s.totalAnswered;
    const c = s.totalCorrect;
    const p = a ? Math.round((c/a)*100) : 0;
    return `<div class="card" style="margin:8px 0">
      <div><b>المحاضرة ${parseInt(lec.replace('L',''),10)}</b> — صح ${c}/${a} (${p}%) • غلط ${w}</div>
    </div>`;
  }).join("");

  r.innerHTML = `
    <div class="grid">
      <div class="card">
        <div class="muted">النتيجة</div>
        <div class="kpi">${pct}%</div>
        <div>صح: <b>${correct}</b> من <b>${answered}</b> مجاوب</div>
        <div class="muted">غير مجاوب: ${unanswered} • ${timeout ? "انتهى الوقت" : "انتهيت يدويًا"}</div>
      </div>
      <div class="card">
        <div class="muted">إعادة الغلط (تلقائي)</div>
        <div>عدد الغلط: <b>${wrong.length}</b></div>
        <button class="btn" id="redoBtn" ${wrong.length? "":"disabled"}>ابدأ إعادة الغلط</button>
        <button class="btn2" id="backBtn">رجوع للإعدادات</button>
      </div>
    </div>

    <div class="card">
      <div style="font-weight:700; margin-bottom:6px">تحليل حسب المحاضرة</div>
      ${perLectHTML || `<div class="muted">لا يوجد بيانات.</div>`}
    </div>

    <div class="card">
      <div style="font-weight:700; margin-bottom:6px">تتبّع تطورك (آخر 10 محاولات)</div>
      <div class="muted" id="hist"></div>
    </div>
  `;

  $("backBtn").onclick = () => {
    r.style.display = "none";
    $("setup").style.display = "block";
  };

  $("redoBtn").onclick = () => {
    const picked = wrongIds.map(id => bank.questions.find(q=>q.id===id));
    state = {
      lecture: "WRONG",
      minutes: Math.max(5, Math.min(15, Math.ceil(picked.length * 0.5))),
      timeLeft: Math.max(5, Math.min(15, Math.ceil(picked.length * 0.5))) * 60,
      i: 0,
      picked,
      answers: {},
      optOrder: {},
      startedAt: nowISO(),
      doShuffleO: true
    };
    for (const q of picked) state.optOrder[q.id] = shuffledOptions(q);

    r.style.display = "none";
    $("exam").style.display = "block";
    $("pillLecture").textContent = "إعادة الغلط";
    $("hint").textContent = "جلسة إعادة الغلط (مؤقت قصير تلقائي).";
    renderQuestion();
    startTimer();
  };

  const prog = loadProgress();
  const hist = prog.history.slice(-10).reverse().map(h=>{
    const d = new Date(h.at);
    const when = d.toLocaleString("ar");
    const lec = h.lecture === "ALL" ? "كل المنهج" : (h.lecture === "WRONG" ? "إعادة الغلط" : `المحاضرة ${parseInt(h.lecture.replace('L',''),10)}`);
    return `• ${when} — ${lec} — ${h.pct}% (صح ${h.correct}/${h.answered})`;
  }).join("<br>");
  $("hist").innerHTML = hist || "لا يوجد محاولات بعد.";
}

init();
