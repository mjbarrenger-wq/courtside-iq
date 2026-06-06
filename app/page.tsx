export default async function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const gamesRes = await fetch(`${url}/rest/v1/games?select=*,opponents(full_name)&order=game_date.asc`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    cache: 'no-store'
  })
  const gamesRaw = await gamesRes.json()
  const games = gamesRaw.map((g: any) => ({
    ...g,
    opponent_name: g.opponents?.full_name ?? 'Unknown'
  }))

  const statsRes = await fetch(`${url}/rest/v1/player_game_stats?select=player_id,points,reb,ast,stl,blk`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    cache: 'no-store'
  })
  const stats = await statsRes.json()

  const playersRes = await fetch(`${url}/rest/v1/players?select=*`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` },
    cache: 'no-store'
  })
  const players = await playersRes.json()

  const wins = games.filter((g: any) => g.result === 'W').length
  const losses = games.filter((g: any) => g.result === 'L').length
  const totalPoints = games.reduce((sum: number, g: any) => sum + g.team_score, 0)
  const totalOppPoints = games.reduce((sum: number, g: any) => sum + g.opponent_score, 0)
  const pointDiff = totalPoints - totalOppPoints

  const playerTotals = players.map((p: any) => {
    const playerStats = stats.filter((s: any) => s.player_id === p.id)
    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      games: playerStats.length,
      points: playerStats.reduce((sum: number, s: any) => sum + (s.points || 0), 0),
      reb: playerStats.reduce((sum: number, s: any) => sum + (s.reb || 0), 0),
      ast: playerStats.reduce((sum: number, s: any) => sum + (s.ast || 0), 0),
      stl: playerStats.reduce((sum: number, s: any) => sum + (s.stl || 0), 0),
      blk: playerStats.reduce((sum: number, s: any) => sum + (s.blk || 0), 0),
    }
  }).sort((a: any, b: any) => b.points - a.points)

  return (
    <main className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <h1 className="text-4xl font-bold mb-1" style={{ color: 'var(--brand-primary)' }}>
        Courtside IQ
      </h1>
      <p className="text-muted mb-2 text-sm">WGT 12.2 — 2025/26 Season</p>
      <div className="flex gap-4 mb-8">
        <a href="/dashboard" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
          → Value Driver Tree
        </a>
        <a href="/players" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-primary)' }}>
          → Player Quadrants
        </a>
      </div>

      {/* Season Record */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <div className="text-3xl font-bold">{wins}-{losses}</div>
          <div className="text-muted text-sm mt-1">Season Record</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold">{games.length}</div>
          <div className="text-muted text-sm mt-1">Games Played</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold">{(totalPoints / games.length).toFixed(1)}</div>
          <div className="text-muted text-sm mt-1">Avg Points For</div>
        </div>
        <div className="card text-center">
          <div
            className="text-3xl font-bold"
            style={{ color: pointDiff >= 0 ? '#16a34a' : '#dc2626' }}
          >
            {pointDiff >= 0 ? '+' : ''}{pointDiff}
          </div>
          <div className="text-muted text-sm mt-1">Point Differential</div>
        </div>
      </div>

      {/* Player Stats Table */}
      <h2 className="text-2xl font-bold mb-4">Season Player Stats</h2>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--card-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: 'var(--brand-primary)', color: '#ffffff' }}>
              <th className="text-left p-3">Player</th>
              <th className="p-3">GP</th>
              <th className="p-3">PTS</th>
              <th className="p-3">REB</th>
              <th className="p-3">AST</th>
              <th className="p-3">STL</th>
              <th className="p-3">BLK</th>
              <th className="p-3">PPG</th>
            </tr>
          </thead>
          <tbody>
            {playerTotals.map((p: any, i: number) => (
              <tr key={i} className={i % 2 === 0 ? 'row-base' : 'row-alt'}>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 text-center text-muted">{p.games}</td>
                <td className="p-3 text-center">{p.points}</td>
                <td className="p-3 text-center">{p.reb}</td>
                <td className="p-3 text-center">{p.ast}</td>
                <td className="p-3 text-center">{p.stl}</td>
                <td className="p-3 text-center">{p.blk}</td>
                <td className="p-3 text-center font-bold" style={{ color: 'var(--brand-primary)' }}>
                  {(p.points / p.games).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent Games */}
      <h2 className="text-2xl font-bold mt-8 mb-4">Game Results</h2>
      <div className="space-y-2">
        {[...games].reverse().slice(0, 10).map((game: any) => (
          <div
            key={game.id}
            className="flex items-center justify-between p-3 rounded-lg"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
          >
            <span className="text-muted text-sm w-24">{game.game_date}</span>
            <span className="text-sm flex-1 text-center">
              {game.home_away === 'home' ? 'vs' : '@'} {game.opponent_name}
            </span>
            <span className="font-bold w-20 text-center">{game.team_score} – {game.opponent_score}</span>
            <span
              className="font-bold w-8 text-center"
              style={{ color: game.result === 'W' ? '#16a34a' : '#dc2626' }}
            >
              {game.result}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
