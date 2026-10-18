// 홈·크루즈 등 새 페이지가 함께 쓰는 저장·동기화·테마 도우미
import { FIREBASE_CONFIG } from "./firebase-config.js";

export const $ = id => document.getElementById(id);
export const esc = s => String(s??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
export const won = n => Math.round(n).toLocaleString("ko-KR") + "원";

// 테마는 모든 페이지가 같은 설정을 씀
const THEME_KEY = "danang-planner-theme";
export function initTheme(btn){
  let theme = null;
  try{ theme = localStorage.getItem(THEME_KEY); }catch(e){}
  if(theme) document.documentElement.dataset.theme = theme;
  btn.onclick = () => {
    const dark = theme ? theme==="dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    theme = dark ? "light" : "dark"; document.documentElement.dataset.theme = theme;
    try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
  };
}

// 페이지 하나의 상태를 localStorage + Firestore(plans/<planId>)에 저장
export function createStore({key, planId, defaults, migrate = () => false, render}){
  const store = { state: defaults() };
  let remote = null, pushTimer = null, lastPushed = null;
  const setSync = t => { $("syncStatus").textContent = t; };

  try{ const s = JSON.parse(localStorage.getItem(key)); if(s){ migrate(s); store.state = Object.assign(defaults(), s); } }catch(e){}

  async function push(){
    pushTimer = null;
    const data = JSON.stringify(store.state);
    lastPushed = data;
    try{ await remote.setDoc(remote.ref, {data, updatedAt: Date.now()}); setSync("☁️ 동기화됨"); }
    catch(e){ console.error(e); setSync("⚠️ 저장 실패"); }
  }
  store.save = () => {
    try{ localStorage.setItem(key, JSON.stringify(store.state)); }catch(e){}
    if(remote){ clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); setSync("저장 대기…"); }
  };
  function applyRemote(data){
    const s = JSON.parse(data), migrated = migrate(s);
    store.state = Object.assign(defaults(), s);
    try{ localStorage.setItem(key, JSON.stringify(store.state)); }catch(e){}
    render();
    if(migrated) store.save();
  }
  store.initSync = async () => {
    if(!FIREBASE_CONFIG){ setSync("이 기기에만 저장"); return; }
    const base = "https://www.gstatic.com/firebasejs/10.12.2/";
    let app, authMod, fs;
    try{
      [app, authMod, fs] = await Promise.all([import(base+"firebase-app.js"), import(base+"firebase-auth.js"), import(base+"firebase-firestore.js")]);
    }catch(e){ console.error(e); setSync("⚠️ 동기화 불러오기 실패"); return; }
    const fb = app.initializeApp(FIREBASE_CONFIG), auth = authMod.getAuth(fb), db = fs.getFirestore(fb);
    const ref = fs.doc(db, "plans", planId);
    let unsub = null;
    $("authBtn").hidden = false;
    $("authBtn").onclick = async () => {
      if(auth.currentUser){ await authMod.signOut(auth); return; }
      try{ await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider()); }
      catch(e){ if(e.code!=="auth/popup-closed-by-user" && e.code!=="auth/cancelled-popup-request") alert("로그인 실패: "+e.code); }
    };
    authMod.onAuthStateChanged(auth, user => {
      if(unsub){ unsub(); unsub = null; }
      remote = null;
      if(!user){ $("authBtn").textContent = "Google 로그인"; setSync("로그인하면 동기화"); return; }
      $("authBtn").textContent = "로그아웃";
      setSync("불러오는 중…");
      unsub = fs.onSnapshot(ref, snap => {
        if(snap.metadata.hasPendingWrites) return;
        const first = !remote;
        remote = {ref, setDoc: fs.setDoc};
        if(snap.exists()){
          const data = snap.data().data;
          // 내가 방금 보낸 값이거나, 아직 안 보낸 편집이 있으면 덮어쓰지 않음
          if(data !== lastPushed && !pushTimer && data !== JSON.stringify(store.state)) applyRemote(data);
        }else if(first){
          push();
        }
        setSync("☁️ 동기화됨");
      }, err => { console.error(err); setSync(`⚠️ 접근 권한 없음 (${user.email})`); });
    });
  };
  return store;
}

// 주소의 #이름으로 섹션 하나만 보여주는 탭 (nav 안의 #링크 순서대로)
export function initTabs(){
  const TABS = [...document.querySelectorAll("nav a[href^='#']")].map(a=>({id:a.getAttribute("href").slice(1), label:a.textContent, el:a}));
  function showTab(){
    const id = TABS.some(t=>t.id===location.hash.slice(1)) ? location.hash.slice(1) : TABS[0].id;
    document.querySelectorAll("main > section").forEach(s=>s.classList.toggle("active", s.id===id));
    TABS.forEach(t=>t.el.classList.toggle("active", t.id===id));
    const i = TABS.findIndex(t=>t.id===id), prev = TABS[i-1], next = TABS[i+1];
    $("pager").innerHTML = (prev?`<a href="#${prev.id}">← ${prev.label}</a>`:"<span></span>") + (next?`<a href="#${next.id}">${next.label} →</a>`:"<span></span>");
    setTimeout(()=>{ window.scrollTo(0, 0); TABS[i].el.parentElement.scrollLeft = TABS[i].el.offsetLeft - 60; }, 0);
  }
  history.scrollRestoration = "manual";
  window.addEventListener("hashchange", showTab);
  window.addEventListener("load", ()=>setTimeout(()=>window.scrollTo(0, 0), 0));
  showTab();
}

// [이름, 주소] 목록 → 링크 버튼
export const linkHtml = list => list.map(([t,u])=>`<a href="${u}" target="_blank" rel="noopener">${t} ↗</a>`).join("");
