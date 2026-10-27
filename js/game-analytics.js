/* Observe real referee state. Never send gid, player IDs/names, or room codes. */
(function(root){
  function create(ga){
    let gid=null,lastRound=0;
    const observed=new Set();
    return {leave(){gid=null;ga?.pause();},observe(s,room){
      if(!s||!room||!ga)return;
      const fresh=s.spins===0 && s.round===1 && s.phase==='turn';
      const p={play_mode:room.kind==='online'?'online':'local',game_mode:s.settings.mode,player_count:s.players.length,bot_count:s.players.filter(p=>p.bot).length};
      if(gid!==s.gid){gid=s.gid;lastRound=s.round;ga.begin({...p,entry_type:observed.has(gid)?'rejoin':fresh?'new':'join_in_progress'});observed.add(gid);}
      // Participant milestones count browsers, match_* count the current referee only.
      if(room.isHost){
        if(fresh)ga.once('match_start','match_start',p);
        if(s.round>lastRound)ga.once('round:'+lastRound,'round_complete',{...p,round_number:lastRound});
        if(s.phase==='result'&&s.result&&s.spin){const player=s.players.find(p=>p.id===s.result.player);ga.once('spin:'+s.spin.id,'spin_result',{...p,round_number:s.round,letter:s.result.letter,actor_type:player?.bot?'bot':'human'});}
        if(s.phase==='over'){ga.once('round:'+s.round,'round_complete',{...p,round_number:s.round});ga.once('match_complete','match_complete',p);}
      }
      lastRound=s.round;
      if(s.phase==='over')ga.finish(p);
    }};
  }
  if(typeof module==='object'&&module.exports)module.exports={create};
  else root.DreidelAnalytics=create(root.GameAnalytics);
})(typeof window==='undefined'?globalThis:window);
