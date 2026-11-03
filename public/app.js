// public/app.js - مصحح وشامل
const apiBase = '/api';
let selectedPatientId = null;
let chartInstance = null;
window._pointNotes = window._pointNotes || {};

// metric config
const METRICS = {
  glucose: { label: 'سكر (mg/dL)', color: '#1f77b4', yId: 'y-glucose' },
  systolic_bp: { label: 'ضغط - انقباضي (mmHg)', color: '#2ca02c', yId: 'y-bp' },
  diastolic_bp: { label: 'ضغط - انبساطي (mmHg)', color: '#98df8a', yId: 'y-bp' },
  ldl: { label: 'LDL (mg/dL)', color: '#d62728', yId: 'y-ldl' }
};

function toISODate(val){
  if(!val) return null;
  // if already YYYY-MM-DD keep
  if(/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if(isNaN(d)) return null;
  return d.toISOString().split('T')[0];
}

// ---------- DOM bindings ----------
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnCreate').addEventListener('click', createPatient);
  document.getElementById('btnRefresh').addEventListener('click', loadPatients);
  document.getElementById('btnAddMeasure').addEventListener('click', addMeasure);

  // initial load
  loadPatients();
});

// ---------- Patients ----------
async function createPatient(){
  const name = document.getElementById('p_name').value.trim();
  const dob = document.getElementById('p_dob').value || null;
  const gender = document.getElementById('p_gender').value || null;
  const mrn = document.getElementById('p_mrn').value.trim() || null;
  if(!name){ alert('أدخل اسم المريض'); return; }

  try{
    const res = await fetch(`${apiBase}/patients`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, dob, gender, medical_record: mrn })
    });
    const j = await res.json();
    if(j.error){ alert('خطأ: ' + j.error); return; }
    // clean inputs
    document.getElementById('p_name').value = '';
    document.getElementById('p_dob').value = '';
    document.getElementById('p_gender').value = '';
    document.getElementById('p_mrn').value = '';
    // reload list
    await loadPatients();
    // select the newly created patient if id returned
    if(j.id) selectPatient(j.id, j.name);
  }catch(err){
    console.error('createPatient', err);
    alert('فشل الاتصال بالخادم');
  }
}

async function loadPatients(){
  try{
    const res = await fetch(`${apiBase}/patients`);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const arr = await res.json();
    const tbody = document.querySelector('#patientsTable tbody');
    tbody.innerHTML = '';
    if(!arr || arr.length === 0){
      tbody.innerHTML = '<tr><td colspan="5">لا توجد سجلات</td></tr>';
      return;
    }
    arr.forEach(p=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${p.dob || ''}</td>
        <td>${p.gender || ''}</td>
        <td><button data-id="${p.id}" data-name="${p.name}">اختار</button></td>
      `;
      // delegate event handler on button
      tr.querySelector('button').addEventListener('click', (e)=>{
        const id = e.target.getAttribute('data-id');
        const name = e.target.getAttribute('data-name');
        selectPatient(Number(id), name);
      });
      tbody.appendChild(tr);
    });
  }catch(err){
    console.error('loadPatients', err);
    alert('فشل تحميل قائمة المرضى');
  }
}

function selectPatient(id,name){
  selectedPatientId = id;
  document.getElementById('selName').innerText = name;
  document.getElementById('patientArea').style.display = 'block';
  // رسم الرسم البياني بعد قليل لتأكيد أن العناصر ظهرت
  setTimeout(() => drawChart(), 200);
}

// ---------- Measures ----------
async function postMeasure(patient_id, condition_key, measurement_type, value, taken_at){
  return fetch(`${apiBase}/measures`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ patient_id, condition_key, measurement_type, value, taken_at })
  });
}

async function addMeasure(){
  if(!selectedPatientId){ alert('اختر مريضاً أولاً'); return; }
  const cond = document.getElementById('condKey').value;
  const rawValue = document.getElementById('measValue').value.trim();
  const dateVal = document.getElementById('measDate').value;
  if(!rawValue || !dateVal){ alert('ادخل قيمة واختر تاريخ'); return; }
  const taken_at = toISODate(dateVal);
  if(!taken_at){ alert('تاريخ غير صالح'); return; }

  try{
    if(cond === 'blood_pressure'){
      if(rawValue.includes('/')){
        const [s,d] = rawValue.split('/').map(x=>parseFloat(x.trim()));
        if(isNaN(s) || isNaN(d)){ alert('القيمة غير صحيحة. استخدم 120/80 أو قيمة رقمية'); return; }
        await postMeasure(selectedPatientId, cond, 'systolic_bp', s, taken_at);
        await postMeasure(selectedPatientId, cond, 'diastolic_bp', d, taken_at);
      } else {
        const v = parseFloat(rawValue);
        if(isNaN(v)){ alert('ادخل قيمة رقمية للضغط'); return; }
        await postMeasure(selectedPatientId, cond, 'systolic_bp', v, taken_at);
      }
    } else if(cond === 'glucose'){
      const v = parseFloat(rawValue); if(isNaN(v)){ alert('ادخل قيمة رقمية للسكر'); return; }
      await postMeasure(selectedPatientId, cond, 'glucose', v, taken_at);
    } else if(cond === 'cholesterol'){
      const v = parseFloat(rawValue); if(isNaN(v)){ alert('ادخل قيمة رقمية للدهون'); return; }
      await postMeasure(selectedPatientId, cond, 'ldl', v, taken_at);
    } else {
      const v = parseFloat(rawValue); if(isNaN(v)){ alert('قيمة غير صالحة'); return; }
      await postMeasure(selectedPatientId, cond, cond, v, taken_at);
    }

    document.getElementById('measValue').value = '';
    document.getElementById('measDate').value = '';
    // after add, redraw chart and reload patients (to be safe)
    await drawChart();
    await loadPatients();
  }catch(err){
    console.error('addMeasure', err);
    alert('فشل إضافة القياس');
  }
}

// ---------- Charting: multi-axis, weekly buckets ----------
async function drawChart(){
  if(!selectedPatientId) return;

  // fetch all measures for patient
  let res = await fetch(`${apiBase}/measures/${selectedPatientId}`);
  if(!res.ok){ console.error('measures fetch failed', res.status); return; }
  let rows = await res.json();
  if(!Array.isArray(rows)) rows = [];

  // keep last 3 months
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth()-2, 1);
  rows = rows.filter(r => new Date(r.taken_at) >= start);

  // normalize type and iso date
  rows = rows.map(r=>{
    const raw = (r.measurement_type || r.condition_key || '').toString().toLowerCase();
    const norm = raw.includes('gluc') ? 'glucose'
               : raw.includes('systol') ? 'systolic_bp'
               : raw.includes('diastol') ? 'diastolic_bp'
               : raw.includes('ldl') || raw.includes('chol') ? 'ldl'
               : raw;
    return { ...r, _type: norm, taken_at: toISODate(r.taken_at) };
  });

  // build weekly labels meta (for last 3 months)
  function weekOfMonth(d){ return Math.ceil(d.getDate()/7); }
  function buildLabels(ref=new Date()){
    const meta = [];
    for(let m=2; m>=0; m--){
      const dt = new Date(ref.getFullYear(), ref.getMonth()-m, 1);
      const year = dt.getFullYear(), month = dt.getMonth();
      const daysInMonth = new Date(year, month+1, 0).getDate();
      const weeks = Math.ceil(daysInMonth/7);
      for(let w=1; w<=weeks; w++) meta.push({ year, month, week:w, label:`${year}-${String(month+1).padStart(2,'0')}-W${w}` });
    }
    return meta;
  }
  const labelsMeta = buildLabels();
  const labels = labelsMeta.map(m => `${m.year}/${String(m.month+1).padStart(2,'0')} W${m.week}`);

  // aggregate: latest value in the week for each metric
  const agg = {}; // key=`label|type` -> record
  rows.forEach(r=>{
    const d = new Date(r.taken_at);
    const w = weekOfMonth(d);
    const meta = labelsMeta.find(x => x.year===d.getFullYear() && x.month===d.getMonth() && x.week===w);
    if(!meta) return;
    const lbl = `${meta.year}-${String(meta.month+1).padStart(2,'0')}-W${meta.week}`;
    const key = `${lbl}|${r._type}`;
    if(!agg[key] || new Date(r.taken_at) > new Date(agg[key].taken_at)) agg[key] = r;
  });

  const metricKeys = ['glucose','systolic_bp','diastolic_bp','ldl'];
  const datasets = metricKeys.map(k=>{
    const info = METRICS[k];
    const data = labelsMeta.map(m=>{
      const lbl = `${m.year}-${String(m.month+1).padStart(2,'0')}-W${m.week}`;
      const rec = agg[`${lbl}|${k}`];
      return rec ? Number(rec.value) : null;
    });
    return {
      label: info.label,
      data,
      borderColor: info.color,
      backgroundColor: info.color,
      yAxisID: info.yId,
      spanGaps: true,
      pointRadius: 6
    };
  });

  // skip if no data
  const hasAny = datasets.some(ds => ds.data.some(v => v !== null));
  const ctx = document.getElementById('chart').getContext('2d');
  if(chartInstance) chartInstance.destroy();
  if(!hasAny){
    ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
    ctx.font = "14px Arial";
    ctx.fillStyle = "#666";
    ctx.fillText("لا توجد بيانات لآخر 3 أشهر لعرض الرسم البياني.", 10, 30);
    chartInstance = null;
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: true },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            title: items => items[0]?.label || '',
            label: ctx => {
              const v = ctx.raw;
              const lbl = ctx.dataset.label;
              const idx = ctx.dataIndex;
              const key = `${lbl}|${idx}`;
              const note = window._pointNotes && window._pointNotes[key] ? ` — ملاحظة: ${window._pointNotes[key]}` : '';
              return `${lbl}: ${v === null ? '-' : v}${note}`;
            }
          }
        }
      },
      scales: {
        x: { title: { display:true, text:'أسابيع (الأشهر الثلاثة الأخيرة)' }, ticks:{ maxRotation:0 } },
        'y-glucose': { type:'linear', display:true, position:'left', title:{display:true, text:'سكر mg/dL'} },
        'y-bp': { type:'linear', display:true, position:'right', title:{display:true, text:'ضغط mmHg'}, grid:{ drawOnChartArea:false } },
        'y-ldl': { type:'linear', display:true, position:'right', offset:true, title:{display:true, text:'LDL mg/dL'}, grid:{ drawOnChartArea:false } }
      },
      onClick: function(evt, activeEls){
        if(!activeEls.length) return;
        const el = activeEls[0];
        const lbl = this.data.datasets[el.datasetIndex].label;
        const idx = el.index;
        const key = `${lbl}|${idx}`;
        const existing = window._pointNotes && window._pointNotes[key] ? window._pointNotes[key] : '';
        const note = prompt('اكتب ملاحظة لهذه النقطة (اتركها فارغة للحذف):', existing);
        if(note === null) return;
        if(!window._pointNotes) window._pointNotes = {};
        if(note.trim() === '') delete window._pointNotes[key]; else window._pointNotes[key] = note.trim();
        this.update();
      }
    }
  });
}
