export default async function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const res = await fetch(`${url}/rest/v1/games?select=*`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    cache: 'no-store'
  })

  const games = await res.json()

  if (!res.ok) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold mb-6">Courtside IQ</h1>
        <p>Error: {JSON.stringify(games)}</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">Courtside IQ</h1>
      <p>Games in database: {games.length}</p>
      <ul className="space-y-2 mt-4">
        {games.map((game: any) => (
          <li key={game.id} className="p-3 bg-gray-100 rounded">
            {game.game_date} — {game.team_score} : {game.opponent_score} ({game.result})
          </li>
        ))}
      </ul>
    </main>
  )
}