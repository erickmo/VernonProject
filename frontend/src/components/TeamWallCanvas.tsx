import { useState } from 'react'
import { Avatar, Segmented } from '@/components/ui'
import type { TeamWallUser, TeamMember } from '@/lib/types'

export type WallMode = 'photo' | 'grid' | 'mosaic'

export const WALL_MODES: { value: WallMode; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'grid', label: 'Grid' },
  { value: 'mosaic', label: 'Mosaic' },
]

export function TeamWallCanvas({ users, mode }: { users: TeamWallUser[]; mode: WallMode }) {
  const [selected, setSelected] = useState<TeamWallUser | null>(null)
  const label = (u: TeamWallUser) => u.full_name || u.name
  const pick = (u: TeamWallUser) =>
    setSelected((cur) => (cur && cur.name === u.name ? null : u))

  return (
    <div className="relative">
      {mode === 'grid' && (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {users.map((u) => (
            <button
              key={u.name}
              onClick={() => pick(u)}
              className="flex flex-col items-center gap-2 transition active:scale-95"
            >
              <Avatar name={label(u)} image={u.user_image} config={u.avatar_config} size={64} />
              <span className="line-clamp-1 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                {label(u)}
              </span>
            </button>
          ))}
        </div>
      )}

      {mode === 'mosaic' && (
        // ponytail: fixed-size square tiles in a no-gap flex-wrap = edge-to-edge wall.
        // Tile size (52) is the knob for denser/looser packing.
        <div className="flex flex-wrap justify-center leading-[0]">
          {users.map((u) => (
            <button key={u.name} onClick={() => pick(u)} title={label(u)}>
              <Avatar name={label(u)} image={u.user_image} config={u.avatar_config} size={52} square />
            </button>
          ))}
        </div>
      )}

      {mode === 'photo' && (
        // ponytail: negative margins overlap avatars like a packed group photo;
        // alternating row offset gives the staggered look. Margins are the knob.
        <div className="flex flex-wrap justify-center">
          {users.map((u, i) => (
            <button
              key={u.name}
              onClick={() => pick(u)}
              className="-mb-1 -ml-3 transition first:ml-0 hover:z-10 active:scale-95"
              style={{ marginTop: i % 2 ? 14 : 0 }}
            >
              <Avatar name={label(u)} image={u.user_image} config={u.avatar_config} size={56} rounded />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="sticky bottom-4 mt-4 flex justify-center">
          <span className="rounded-full bg-slate-900/90 px-4 py-1.5 text-sm font-semibold text-white shadow-lg dark:bg-white/90 dark:text-slate-900">
            {label(selected)}
          </span>
        </div>
      )}
    </div>
  )
}

// Per-project group photo: same wall canvas, scoped to one project's members.
// Project members carry {user,name,image,avatar_config}; the canvas wants
// {name,full_name,user_image,avatar_config} — remap so it keys/labels correctly.
export function ProjectGroupPhoto({ team }: { team: TeamMember[] }) {
  const [mode, setMode] = useState<WallMode>('photo')
  if (!team.length) return null
  const users: TeamWallUser[] = team.map((m) => ({
    name: m.user,
    full_name: m.name,
    user_image: m.image,
    avatar_config: m.avatar_config,
  }))
  return (
    <div className="space-y-3">
      <Segmented options={WALL_MODES} value={mode} onChange={setMode} />
      <TeamWallCanvas users={users} mode={mode} />
    </div>
  )
}
