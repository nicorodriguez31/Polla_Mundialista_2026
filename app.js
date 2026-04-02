
const BASE = window.APP_DATA;
const STORAGE_KEY = "mundial2026_pro_v1";

const state = {
  teams: BASE.teams,
  matches: BASE.matches.map(m => ({...m})),
  players: [],
  predictions: {},
  scoring: {...BASE.defaultScoring},
  filters: {
    matchGroup: "ALL",
    matchSearch: "",
    predictionPlayer: "",
    predictionGroup: "ALL",
    predictionSearch: ""
  },
  selectedLeaderboardPlayer: ""
};

function freshState() {
  return {
    matches: BASE.matches.map(m => ({id:m.id, homeScore:m.homeScore ?? null, awayScore:m.awayScore ?? null})),
    players: [],
    predictions: {},
    scoring: {...BASE.defaultScoring}
  };
}

function saveState() {
  const payload = {
    matches: state.matches.map(({id, homeScore, awayScore}) => ({id, homeScore, awayScore})),
    players: state.players,
    predictions: state.predictions,
    scoring: state.scoring
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.matches) {
      state.matches = BASE.matches.map(m => {
        const found = parsed.matches.find(x => x.id === m.id);
        return found ? {...m, homeScore: found.homeScore, awayScore: found.awayScore} : {...m};
      });
    }
    state.players = Array.isArray(parsed.players) ? parsed.players : [];
    state.predictions = parsed.predictions || {};
    state.scoring = parsed.scoring || {...BASE.defaultScoring};
    state.selectedLeaderboardPlayer = state.players[0]?.id || "";
  } catch (e) {
    console.error("No se pudo cargar el estado", e);
  }
}

function uid() {
  return "p_" + Math.random().toString(36).slice(2, 10);
}

function parseScore(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function isPlayed(match) {
  return Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore);
}

function outcome(h, a) {
  if (h > a) return "H";
  if (h < a) return "A";
  return "D";
}

function getStandings() {
  const byGroup = {};
  const idx = {};
  state.teams.forEach(team => {
    if (!byGroup[team.group]) byGroup[team.group] = [];
    const row = {team:team.name, group:team.group, pj:0, pg:0, pe:0, pp:0, gf:0, gc:0, dg:0, pts:0};
    byGroup[team.group].push(row);
    idx[team.group] ??= {};
    idx[team.group][team.name] = row;
  });

  state.matches.forEach(match => {
    if (!isPlayed(match)) return;
    const home = idx[match.group][match.home];
    const away = idx[match.group][match.away];
    home.pj += 1; away.pj += 1;
    home.gf += match.homeScore; home.gc += match.awayScore;
    away.gf += match.awayScore; away.gc += match.homeScore;
    home.dg = home.gf - home.gc;
    away.dg = away.gf - away.gc;
    if (match.homeScore > match.awayScore) {
      home.pg += 1; home.pts += 3; away.pp += 1;
    } else if (match.homeScore < match.awayScore) {
      away.pg += 1; away.pts += 3; home.pp += 1;
    } else {
      home.pe += 1; away.pe += 1; home.pts += 1; away.pts += 1;
    }
  });

  Object.keys(byGroup).forEach(group => {
    byGroup[group].sort((a,b) =>
      b.pts - a.pts ||
      b.dg - a.dg ||
      b.gf - a.gf ||
      a.gc - b.gc ||
      a.team.localeCompare(b.team, "es")
    );
  });

  return byGroup;
}

function calcPlayerStats(playerId) {
  let exact = 0;
  let outcomeHits = 0;
  let points = 0;
  let pending = 0;
  const details = [];

  for (const match of state.matches) {
    const pred = state.predictions[playerId]?.[match.id];
    if (!pred || pred.homeScore === null || pred.awayScore === null) {
      if (isPlayed(match)) pending += 0;
      continue;
    }
    if (!isPlayed(match)) {
      pending += 1;
      continue;
    }
    let rowPoints = 0;
    const exactHit = pred.homeScore === match.homeScore && pred.awayScore === match.awayScore;
    const outcomeHit = outcome(pred.homeScore, pred.awayScore) === outcome(match.homeScore, match.awayScore);

    if (exactHit) {
      exact += 1;
      rowPoints += Number(state.scoring.exact || 0);
    } else if (outcomeHit) {
      outcomeHits += 1;
      rowPoints += Number(state.scoring.outcome || 0);
    }

    points += rowPoints;
    details.push({
      matchId: match.id,
      label: `${match.home} vs ${match.away}`,
      actual: `${match.homeScore}-${match.awayScore}`,
      predicted: `${pred.homeScore}-${pred.awayScore}`,
      points: rowPoints
    });
  }

  return {points, exact, outcomeHits, pending, details};
}

function getLeaderboard() {
  return state.players.map(player => ({
    ...player,
    ...calcPlayerStats(player.id)
  })).sort((a,b) =>
    b.points - a.points ||
    b.exact - a.exact ||
    b.outcomeHits - a.outcomeHits ||
    a.name.localeCompare(b.name, "es")
  );
}

function setView(view) {
  document.querySelectorAll(".menu-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === view + "View"));
  const titles = {
    dashboard: "Dashboard",
    matches: "Resultados",
    groups: "Grupos",
    players: "Participantes",
    predictions: "Pronósticos",
    leaderboard: "Ranking",
    settings: "Ajustes"
  };
  document.getElementById("viewTitle").textContent = titles[view] || "Mundial 2026 Pro";
}

function renderDashboard() {
  const played = state.matches.filter(isPlayed).length;
  const leaderboard = getLeaderboard();

  const cards = [
    {label:"Equipos", value: state.teams.length},
    {label:"Partidos", value: state.matches.length},
    {label:"Jugados", value: played},
    {label:"Participantes", value: state.players.length},
    {label:"Pronósticos cargados", value: countPredictionsFilled()},
    {label:"Líder actual", value: leaderboard[0]?.name || "—"}
  ];

  document.getElementById("dashboardCards").innerHTML = cards.map(c => `
    <article class="card">
      <div class="card-label">${c.label}</div>
      <div class="card-value">${c.value}</div>
    </article>
  `).join("");

  const recent = [...state.matches].filter(isPlayed).sort((a,b) => b.id - a.id).slice(0,8);
  document.getElementById("recentMatches").innerHTML = recent.length ? recent.map(m => `
    <div class="recent-item">
      <div>
        <strong>Partido ${m.id}</strong>
        <div class="meta">${m.home} ${m.homeScore} - ${m.awayScore} ${m.away}</div>
      </div>
      <span class="pill">Grupo ${m.group}</span>
    </div>
  `).join("") : `<div class="empty-state">Aún no has cargado resultados oficiales.</div>`;

  document.getElementById("topPlayers").innerHTML = leaderboard.length ? leaderboard.slice(0,8).map((p, i) => `
    <div class="player-item">
      <div>
        <strong>#${i + 1} ${p.name}</strong>
        <div class="meta">${p.exact} exactos · ${p.outcomeHits} aciertos de resultado</div>
      </div>
      <span class="pill">${p.points} pts</span>
    </div>
  `).join("") : `<div class="empty-state">Todavía no hay participantes.</div>`;
}

function renderMatches() {
  const list = document.getElementById("matchesList");
  const q = state.filters.matchSearch.trim().toLowerCase();
  const filtered = state.matches.filter(m => {
    const groupOk = state.filters.matchGroup === "ALL" || m.group === state.filters.matchGroup;
    const textOk = !q || `${m.id} ${m.group} ${m.home} ${m.away}`.toLowerCase().includes(q);
    return groupOk && textOk;
  });

  list.innerHTML = filtered.map(m => {
    const status = isPlayed(m)
      ? (m.homeScore === m.awayScore ? "Empate" : (m.homeScore > m.awayScore ? `Ganó ${m.home}` : `Ganó ${m.away}`))
      : "Pendiente";
    return `
      <article class="match-card">
        <div class="badges">
          <span class="badge">Grupo ${m.group}</span>
          <span class="badge">Partido ${m.id}</span>
        </div>
        <div class="score-row">
          <div class="team-name">${m.home}</div>
          <input class="score-input official-score" data-id="${m.id}" data-side="home" type="number" min="0" step="1" value="${m.homeScore ?? ""}" />
          <div class="vs">vs</div>
          <input class="score-input official-score" data-id="${m.id}" data-side="away" type="number" min="0" step="1" value="${m.awayScore ?? ""}" />
          <div class="team-name right">${m.away}</div>
        </div>
        <div class="meta">${status}</div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".official-score").forEach(input => {
    input.addEventListener("input", e => {
      const id = Number(e.target.dataset.id);
      const side = e.target.dataset.side;
      const match = state.matches.find(x => x.id === id);
      match[side + "Score"] = parseScore(e.target.value);
      saveState();
      refreshAll(false);
    });
  });
}

function renderGroups() {
  const standings = getStandings();
  document.getElementById("groupsGrid").innerHTML = Object.keys(standings).sort().map(group => `
    <section class="panel">
      <div class="panel-head"><h3>Grupo ${group}</h3></div>
      <table>
        <thead>
          <tr><th>#</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${standings[group].map((row, idx) => `
            <tr>
              <td class="rank">${idx + 1}</td>
              <td>${row.team}</td>
              <td>${row.pj}</td>
              <td>${row.pg}</td>
              <td>${row.pe}</td>
              <td>${row.pp}</td>
              <td>${row.gf}</td>
              <td>${row.gc}</td>
              <td>${row.dg}</td>
              <td><strong>${row.pts}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `).join("");
}

function renderPlayers() {
  const list = document.getElementById("playersList");
  if (!state.players.length) {
    list.innerHTML = `<div class="empty-state">No hay participantes todavía.</div>`;
  } else {
    list.innerHTML = state.players.map(p => `
      <div class="player-item">
        <div>
          <strong>${p.name}</strong>
          <div class="meta">ID: ${p.id}</div>
        </div>
        <div class="player-actions">
          <button class="small-btn use-player" data-id="${p.id}">Usar</button>
          <button class="small-btn danger delete-player" data-id="${p.id}">Eliminar</button>
        </div>
      </div>
    `).join("");
  }

  list.querySelectorAll(".use-player").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filters.predictionPlayer = btn.dataset.id;
      document.getElementById("predictionPlayerSelect").value = btn.dataset.id;
      setView("predictions");
      renderPredictions();
    });
  });

  list.querySelectorAll(".delete-player").forEach(btn => {
    btn.addEventListener("click", () => {
      const playerId = btn.dataset.id;
      const player = state.players.find(p => p.id === playerId);
      const ok = confirm(`¿Eliminar a ${player?.name || "este participante"}?`);
      if (!ok) return;
      state.players = state.players.filter(p => p.id !== playerId);
      delete state.predictions[playerId];
      if (state.filters.predictionPlayer === playerId) {
        state.filters.predictionPlayer = state.players[0]?.id || "";
      }
      if (state.selectedLeaderboardPlayer === playerId) {
        state.selectedLeaderboardPlayer = state.players[0]?.id || "";
      }
      saveState();
      refreshAll(false);
    });
  });
}

function fillSelect(el, options, allLabel = "Todos", includeAll = true) {
  el.innerHTML = (includeAll ? `<option value="ALL">${allLabel}</option>` : "") + options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join("");
}

function renderPlayerSelects() {
  const groups = [...new Set(state.teams.map(t => t.group))].sort();
  fillSelect(document.getElementById("matchGroupFilter"), groups.map(g => ({value:g, label:g})));
  fillSelect(document.getElementById("predictionGroupFilter"), groups.map(g => ({value:g, label:g})));

  const playerSelect = document.getElementById("predictionPlayerSelect");
  playerSelect.innerHTML = state.players.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  if (!state.filters.predictionPlayer && state.players[0]) {
    state.filters.predictionPlayer = state.players[0].id;
  }
  if (state.filters.predictionPlayer) playerSelect.value = state.filters.predictionPlayer;
}

function countPredictionsFilled() {
  let count = 0;
  Object.values(state.predictions).forEach(byMatch => {
    Object.values(byMatch).forEach(pred => {
      if (pred && pred.homeScore !== null && pred.awayScore !== null) count += 1;
    });
  });
  return count;
}

function renderPredictions() {
  renderPlayerSelects();
  const empty = document.getElementById("predictionsEmpty");
  const list = document.getElementById("predictionsList");
  const playerId = state.filters.predictionPlayer;

  if (!state.players.length || !playerId) {
    empty.style.display = "block";
    list.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  const q = state.filters.predictionSearch.trim().toLowerCase();

  const filtered = state.matches.filter(m => {
    const groupOk = state.filters.predictionGroup === "ALL" || m.group === state.filters.predictionGroup;
    const textOk = !q || `${m.id} ${m.home} ${m.away} ${m.group}`.toLowerCase().includes(q);
    return groupOk && textOk;
  });

  list.innerHTML = filtered.map(m => {
    const pred = state.predictions[playerId]?.[m.id] || {homeScore:null, awayScore:null};
    const points = isPlayed(m) ? getRowPoints(pred, m) : null;
    return `
      <article class="match-card">
        <div class="badges">
          <span class="badge">Grupo ${m.group}</span>
          <span class="badge">Partido ${m.id}</span>
        </div>
        <div class="score-row">
          <div class="team-name">${m.home}</div>
          <input class="score-input prediction-score" data-player="${playerId}" data-id="${m.id}" data-side="home" type="number" min="0" step="1" value="${pred.homeScore ?? ""}" />
          <div class="vs">vs</div>
          <input class="score-input prediction-score" data-player="${playerId}" data-id="${m.id}" data-side="away" type="number" min="0" step="1" value="${pred.awayScore ?? ""}" />
          <div class="team-name right">${m.away}</div>
        </div>
        <div class="meta">
          ${isPlayed(m) ? `Resultado oficial: ${m.homeScore}-${m.awayScore} · ${points} pts` : "Pendiente de resultado oficial"}
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll(".prediction-score").forEach(input => {
    input.addEventListener("input", e => {
      const player = e.target.dataset.player;
      const id = Number(e.target.dataset.id);
      const side = e.target.dataset.side;
      state.predictions[player] ??= {};
      state.predictions[player][id] ??= {homeScore:null, awayScore:null};
      state.predictions[player][id][side + "Score"] = parseScore(e.target.value);
      saveState();
      refreshAll(false);
    });
  });
}

function getRowPoints(pred, match) {
  if (!pred || pred.homeScore === null || pred.awayScore === null || !isPlayed(match)) return 0;
  if (pred.homeScore === match.homeScore && pred.awayScore === match.awayScore) return Number(state.scoring.exact || 0);
  if (outcome(pred.homeScore, pred.awayScore) === outcome(match.homeScore, match.awayScore)) return Number(state.scoring.outcome || 0);
  return 0;
}

function renderLeaderboard() {
  const leaderboard = getLeaderboard();
  const table = document.getElementById("leaderboardTable");
  if (!leaderboard.length) {
    table.innerHTML = `<div class="empty-state">No hay participantes para rankear.</div>`;
    document.getElementById("leaderboardDetail").innerHTML = `<div class="muted-block">Crea participantes y sus pronósticos para ver el detalle.</div>`;
    return;
  }

  if (!state.selectedLeaderboardPlayer) state.selectedLeaderboardPlayer = leaderboard[0].id;

  table.innerHTML = `
    <table>
      <thead>
        <tr><th>#</th><th>Participante</th><th>Puntos</th><th>Exactos</th><th>Resultado</th><th></th></tr>
      </thead>
      <tbody>
        ${leaderboard.map((p, idx) => `
          <tr>
            <td class="rank">${idx + 1}</td>
            <td>${p.name}</td>
            <td><strong>${p.points}</strong></td>
            <td>${p.exact}</td>
            <td>${p.outcomeHits}</td>
            <td><button class="small-btn see-detail" data-id="${p.id}">Ver</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  table.querySelectorAll(".see-detail").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedLeaderboardPlayer = btn.dataset.id;
      renderLeaderboardDetail();
    });
  });

  renderLeaderboardDetail();
}

function renderLeaderboardDetail() {
  const player = state.players.find(p => p.id === state.selectedLeaderboardPlayer);
  const block = document.getElementById("leaderboardDetail");
  if (!player) {
    block.innerHTML = `<div class="muted-block">Selecciona un participante.</div>`;
    return;
  }
  const stats = calcPlayerStats(player.id);
  block.innerHTML = `
    <div class="player-item">
      <div>
        <strong>${player.name}</strong>
        <div class="meta">${stats.points} pts · ${stats.exact} exactos · ${stats.outcomeHits} de resultado</div>
      </div>
    </div>
    ${stats.details.length ? `
      <table>
        <thead><tr><th>Partido</th><th>Pronóstico</th><th>Oficial</th><th>Puntos</th></tr></thead>
        <tbody>
          ${stats.details.map(d => `
            <tr>
              <td>${d.label}</td>
              <td>${d.predicted}</td>
              <td>${d.actual}</td>
              <td>${d.points}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : `<div class="empty-state">Todavía no hay puntos calculados para este participante.</div>`}
  `;
}

function bindStaticEvents() {
  document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  document.getElementById("matchGroupFilter").addEventListener("change", e => {
    state.filters.matchGroup = e.target.value;
    renderMatches();
  });
  document.getElementById("matchSearch").addEventListener("input", e => {
    state.filters.matchSearch = e.target.value;
    renderMatches();
  });

  document.getElementById("predictionPlayerSelect").addEventListener("change", e => {
    state.filters.predictionPlayer = e.target.value;
    renderPredictions();
  });
  document.getElementById("predictionGroupFilter").addEventListener("change", e => {
    state.filters.predictionGroup = e.target.value;
    renderPredictions();
  });
  document.getElementById("predictionSearch").addEventListener("input", e => {
    state.filters.predictionSearch = e.target.value;
    renderPredictions();
  });

  document.getElementById("playerForm").addEventListener("submit", e => {
    e.preventDefault();
    const input = document.getElementById("playerName");
    const name = input.value.trim();
    if (!name) return;
    const player = {id: uid(), name};
    state.players.push(player);
    state.predictions[player.id] = {};
    state.filters.predictionPlayer = player.id;
    state.selectedLeaderboardPlayer = player.id;
    input.value = "";
    saveState();
    refreshAll(false);
  });

  document.getElementById("scoringForm").addEventListener("submit", e => {
    e.preventDefault();
    state.scoring.exact = parseScore(document.getElementById("exactPoints").value) ?? 0;
    state.scoring.outcome = parseScore(document.getElementById("outcomePoints").value) ?? 0;
    saveState();
    refreshAll(false);
    alert("Sistema de puntos actualizado.");
  });

  document.getElementById("seedBtn").addEventListener("click", loadDemoData);

  document.getElementById("resetBtn").addEventListener("click", () => {
    const ok = confirm("¿Seguro que quieres borrar resultados, participantes y pronósticos?");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    state.matches = BASE.matches.map(m => ({...m, homeScore:null, awayScore:null}));
    state.players = [];
    state.predictions = {};
    state.scoring = {...BASE.defaultScoring};
    state.filters.predictionPlayer = "";
    state.selectedLeaderboardPlayer = "";
    refreshAll(false);
  });

  document.getElementById("exportBackupBtn").addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      matches: state.matches.map(({id, homeScore, awayScore}) => ({id, homeScore, awayScore})),
      players: state.players,
      predictions: state.predictions,
      scoring: state.scoring
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mundial-2026-pro-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById("importBackupInput").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.players)) state.players = data.players;
      if (data.predictions) state.predictions = data.predictions;
      if (data.scoring) state.scoring = data.scoring;
      if (Array.isArray(data.matches)) {
        state.matches = BASE.matches.map(m => {
          const found = data.matches.find(x => x.id === m.id);
          return found ? {...m, homeScore: found.homeScore, awayScore: found.awayScore} : {...m};
        });
      }
      state.filters.predictionPlayer = state.players[0]?.id || "";
      state.selectedLeaderboardPlayer = state.players[0]?.id || "";
      saveState();
      refreshAll(false);
      alert("Respaldo importado correctamente.");
    } catch (err) {
      alert("No se pudo importar el respaldo.");
      console.error(err);
    }
    e.target.value = "";
  });
}

function loadDemoData() {
  const ok = confirm("Esto agregará participantes y algunos datos de ejemplo.");
  if (!ok) return;

  const names = ["Nico", "Laura", "Sofi", "Mateo", "Juan"];
  state.players = names.map(name => ({id: uid(), name}));
  state.predictions = {};
  state.players.forEach((p, idx) => {
    state.predictions[p.id] = {};
    state.matches.forEach((m, j) => {
      state.predictions[p.id][m.id] = {
        homeScore: (j + idx) % 4,
        awayScore: (j + idx + 1) % 3
      };
    });
  });

  state.matches = state.matches.map((m, idx) => ({
    ...m,
    homeScore: idx < 12 ? (idx % 3) : null,
    awayScore: idx < 12 ? ((idx + 1) % 3) : null
  }));

  state.filters.predictionPlayer = state.players[0]?.id || "";
  state.selectedLeaderboardPlayer = state.players[0]?.id || "";
  saveState();
  refreshAll(false);
}

function refreshAll(save = true) {
  if (save) saveState();
  document.getElementById("exactPoints").value = state.scoring.exact;
  document.getElementById("outcomePoints").value = state.scoring.outcome;
  renderPlayerSelects();
  renderDashboard();
  renderMatches();
  renderGroups();
  renderPlayers();
  renderPredictions();
  renderLeaderboard();
}

function init() {
  loadState();
  bindStaticEvents();
  refreshAll(false);
  setView("dashboard");
}

init();
