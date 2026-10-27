/* Gameplay analytics. See docs/ANALYTICS.md. No player/room/save identifiers leave the game. */
(function (root) {
  'use strict';
  const ID = 'G-ZHTSP3LEH3';
  const allowed = new Set(['game_id','game_mode','entry_type','level_id','chapter','language','play_mode','player_count','bot_count','round_number','letter','actor_type','replay','failure_count','hint_count','seconds','error_category','result_type']);
  function create(env, game) {
    let running=false, active=0, last=env.now(), input=last, first=false;
    let seen=new Set(), milestones=new Set();
    const emit=(name, params={})=>{try {
      const clean={game_id:game,send_to:ID};
      for(const [k,v] of Object.entries(params)) if(allowed.has(k) && (typeof v==='number' && Number.isFinite(v) || typeof v==='string' && /^[a-zA-Z0-9_.-]{1,60}$/.test(v))) clean[k]=v;
      env.send(name,clean);
    } catch (_) { /* blocked analytics must never break gameplay */ }};
    const once=(key,name,p)=>{if(seen.has(key))return;seen.add(key);emit(name,p);};
    return {
      emit, once,
      begin(params={}) {running=true;active=0;last=input=env.now();first=false;seen=new Set();milestones=new Set();emit('game_start',params);},
      pause(){running=false;}, resume(){running=true;last=input=env.now();},
      input(){input=env.now();}, visibility(){last=input=env.now();},
      complete(id,params={}) {if(seen.has('level:'+id))return;seen.add('level:'+id);emit('level_complete',{...params,level_id:id});if(!first){first=true;emit('first_level_complete',{...params,level_id:id});}},
      finish(params={}){once('finished','game_complete',params);running=false;},
      tick(){const now=env.now(),delta=now-last;last=now;if(!running||env.hidden()||now-input>60000||delta<0||delta>5000)return;active+=delta;for(const s of [60,300,600,1200])if(active>=s*1000&&!milestones.has(s)){milestones.add(s);emit('active_play',{seconds:s});}},
    };
  }
  if(typeof module==='object'&&module.exports){module.exports={create};return;}
  const game=document.currentScript?.dataset.game || 'unknown';
  let disabled=false;try{disabled=localStorage.getItem('jb.analytics.disabled')==='1';}catch(_){}
  const cleanURL=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch(_){return '';}};
  if(!disabled){
    root.dataLayer=root.dataLayer||[];
    root.gtag=root.gtag||function(){root.dataLayer.push(arguments);};
    root.gtag('js',new Date());
    root.gtag('config',ID,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:cleanURL(location.href),page_referrer:cleanURL(document.referrer),page_title:document.title});
    root.gtag('event','page_view',{send_to:ID,game_id:game,page_location:cleanURL(location.href),page_referrer:cleanURL(document.referrer)});
    if(location.hostname==='y2jcpa.github.io') {const tag=document.createElement('script');tag.async=true;tag.src='https://www.googletagmanager.com/gtag/js?id='+ID;document.head.append(tag);}
  }
  root.GameAnalytics=create({now:()=>Date.now(),hidden:()=>document.hidden,send:(n,p)=>{if(!disabled)root.gtag?.('event',n,p);}},game);
  for(const event of ['pointerdown','keydown','touchstart'])root.addEventListener(event,()=>root.GameAnalytics.input(),{passive:true});
  document.addEventListener('visibilitychange',()=>root.GameAnalytics.visibility());
  setInterval(()=>root.GameAnalytics.tick(),1000);
})(typeof window==='undefined'?globalThis:window);
