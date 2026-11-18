/* Общий вход на сайт «Сотка»: один пароль на все разделы.
   Ввели один раз — при переходах между разделами больше не спрашивается.
   После перезагрузки страницы (F5, «обновить») — спрашивается снова. Новая вкладка — тоже. */
(function(){
 var K='sotka-gate',H='12289529ade70f5af2421da0e846bbc2504e603809e2ab3146ea7dcae4d750c5';
 var ok=false;
 try{var nav=performance.getEntriesByType('navigation')[0];if(nav&&nav.type==='reload')sessionStorage.removeItem(K);ok=sessionStorage.getItem(K)===H;}catch(e){}
 window.SOTKA_GATE={key:K,hash:H,ok:ok};
 if(ok)return;
 var de=document.documentElement;de.classList.add('sotka-locked');
 var st=document.createElement('style');
 st.textContent='html.sotka-locked body>*:not(#sotkaGate){display:none!important}#sotkaGate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#eef1f8;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#18233c;padding:16px}#sotkaGate form{background:#fff;border-radius:18px;padding:26px 22px;width:min(360px,100%);box-shadow:0 10px 40px #18233c1f;display:grid;gap:12px}#sotkaGate b{font-size:22px}#sotkaGate input{font:inherit;font-size:20px;letter-spacing:4px;text-align:center;padding:12px;border:1px solid #cfd6e4;border-radius:12px;width:100%;box-sizing:border-box}#sotkaGate button{font:inherit;font-weight:700;padding:13px;border:0;border-radius:12px;background:#1d4ed8;color:#fff;cursor:pointer}#sotkaGate small{color:#c0392b;min-height:1.2em}@media(prefers-color-scheme:dark){#sotkaGate{background:#0f1726;color:#e7edf8}#sotkaGate form{background:#1b2638}#sotkaGate input{background:#0f1726;color:#e7edf8;border-color:#33425e}}';
 (document.head||de).appendChild(st);
 function hex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2)}).join('')}
 function show(){
  if(document.getElementById('sotkaGate'))return;
  var w=document.createElement('div');w.id='sotkaGate';
  w.innerHTML='<form autocomplete="off"><b>Вход</b><span>Введите пароль сайта</span><input type="password" inputmode="numeric" aria-label="Пароль" autofocus><button type="submit">Войти</button><small role="alert"></small></form>';
  document.body.appendChild(w);
  var f=w.querySelector('form'),i=w.querySelector('input'),m=w.querySelector('small');
  setTimeout(function(){i.focus()},50);
  f.onsubmit=function(e){e.preventDefault();var v=i.value.trim();if(!v)return;
   if(!(window.crypto&&crypto.subtle)){m.textContent='Откройте сайт по адресу https://';return;}
   crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)).then(function(b){
    if(hex(b)===H){try{sessionStorage.setItem(K,H)}catch(e){}window.SOTKA_GATE.ok=true;w.remove();de.classList.remove('sotka-locked');try{document.dispatchEvent(new Event('sotka-unlock'))}catch(e){}}
    else{m.textContent='Неверный пароль';i.value='';i.focus();}
   });
  };
 }
 if(document.body)show();else document.addEventListener('DOMContentLoaded',show);
})();
