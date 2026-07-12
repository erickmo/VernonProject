import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Award, BookOpen, CalendarDays, Check, MapPin, Phone, Plus, Trash2 } from 'lucide-react'
import { useBoot, useSaveMyProfile } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Spinner } from '@/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { BentoGrid, BentoTile } from '@web/components/bento'
import type { EmployeeChildEducation, EmployeeChildSkill, EmployeeChildTraining } from '@/lib/types'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'
const PROFICIENCIES = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const EDU_LEVELS = ['SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']
const RELIGIONS = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']
const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha'])

// Trainings have no web editor UI (out of scope), but they MUST be round-tripped in the
// payload: the shared api client always sends trainings: JSON.stringify(payload.trainings ?? [])
// and the backend replaces the child table when it's not None — so omitting it here would
// wipe every training the user set on mobile. We hydrate + resend them unchanged.
export default function MyInfo() {
  const { data: boot } = useBoot()
  const employee = boot?.employee
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveMyProfile()

  const [phone, setPhone] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [bio, setBio] = useState('')
  const [homeAddress, setHomeAddress] = useState('')
  const [ecName, setEcName] = useState('')
  const [ecPhone, setEcPhone] = useState('')
  const [ecRelation, setEcRelation] = useState('')
  const [skills, setSkills] = useState<EmployeeChildSkill[]>([])
  const [education, setEducation] = useState<EmployeeChildEducation[]>([])
  // No web editor — hydrated + resent unchanged to avoid wiping mobile-set trainings.
  const [trainings, setTrainings] = useState<EmployeeChildTraining[]>([])
  const [religion, setReligion] = useState('')
  const [verseEnabled, setVerseEnabled] = useState(false)

  // One-shot hydration once boot's employee arrives (useState ignores later prop changes).
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (employee && !hydrated) {
      setPhone(employee.phone ?? '')
      setBirthdate(employee.birthdate ?? '')
      setBio(employee.bio ?? '')
      setHomeAddress(employee.home_address ?? '')
      setEcName(employee.emergency_contact_name ?? '')
      setEcPhone(employee.emergency_contact_phone ?? '')
      setEcRelation(employee.emergency_contact_relation ?? '')
      setSkills(employee.skills ?? [])
      setEducation(employee.education ?? [])
      setTrainings(employee.trainings ?? [])
      setReligion(employee.religion ?? '')
      setVerseEnabled(!!employee.verse_enabled)
      setHydrated(true)
    }
  }, [employee, hydrated])

  const payload = useMemo(
    () => ({
      phone, birthdate, bio, home_address: homeAddress,
      emergency_contact_name: ecName, emergency_contact_phone: ecPhone, emergency_contact_relation: ecRelation,
      skills, education, trainings,
      religion, verse_enabled: (verseEnabled ? 1 : 0) as 0 | 1,
    }),
    [phone, birthdate, bio, homeAddress, ecName, ecPhone, ecRelation, skills, education, trainings, religion, verseEnabled],
  )

  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  useEffect(() => {
    if (hydrated && savedSnapshot === null) setSavedSnapshot(JSON.stringify(payload))
  }, [hydrated, savedSnapshot, payload])
  const dirty = savedSnapshot !== null && JSON.stringify(payload) !== savedSnapshot

  const doSave = () => {
    const snap = JSON.stringify(payload)
    save.mutate(payload, {
      onSuccess: () => {
        setSavedSnapshot(snap)
        toast('success', 'Profile saved')
      },
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save profile'),
    })
  }

  return (
    <Page>
      <button
        onClick={() => navigate('/me')}
        className="mb-1 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Me
      </button>
      <PageHeader
        title="My Info"
        subtitle="Your personal profile — visible to your team."
        actions={
          <button
            onClick={doSave}
            disabled={save.isPending || !hydrated || !dirty}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97] hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {dirty ? 'Save' : 'Saved'}
          </button>
        }
      />

      <BentoGrid>
        {/* Personal */}
        <BentoTile span="lg" tone="plain" title="Personal">
          <div className="mt-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="flex items-center gap-1 text-muted"><Phone className="h-3.5 w-3.5" /> Phone</span>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="+62 xxx" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="flex items-center gap-1 text-muted"><CalendarDays className="h-3.5 w-3.5" /> Birthdate</span>
              <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-2">
              <span className="text-muted">Bio</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={field + ' resize-y'} placeholder="Tell your team a bit about you" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-2">
              <span className="flex items-center gap-1 text-muted"><MapPin className="h-3.5 w-3.5" /> Home Address</span>
              <textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2} className={field + ' resize-y'} placeholder="Full address" />
            </label>
          </div>
        </BentoTile>

        {/* Emergency Contact */}
        <BentoTile span="md" tone="plain" title="Emergency Contact">
          <div className="mt-1 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="text-muted">Name</span>
              <input type="text" value={ecName} onChange={(e) => setEcName(e.target.value)} className={field} placeholder="Full name" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="flex items-center gap-1 text-muted"><Phone className="h-3.5 w-3.5" /> Phone</span>
              <input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} className={field} placeholder="+62 xxx" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-ink">
              <span className="text-muted">Relationship</span>
              <input type="text" value={ecRelation} onChange={(e) => setEcRelation(e.target.value)} className={field} placeholder="e.g. Spouse, Parent" />
            </label>
          </div>
        </BentoTile>

        {/* Ayat Harian */}
        <BentoTile span="md" tone="tint" accent="violet" title="Ayat Harian" icon={BookOpen}>
          <div className="mt-1 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Agama</span>
              <SearchableSelect value={religion} onChange={setReligion} placeholder="— Pilih —"
                options={RELIGIONS.map((r) => ({ value: r, label: r }))} />
            </label>
            {VERSE_SUPPORTED.has(religion) ? (
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">Tampilkan ayat di beranda</span>
                <input type="checkbox" checked={verseEnabled} onChange={(e) => setVerseEnabled(e.target.checked)} className="h-5 w-5 accent-violet-600" />
              </label>
            ) : religion ? (
              <p className="text-xs text-muted">Belum tersedia untuk agama ini.</p>
            ) : null}
          </div>
        </BentoTile>

        {/* Skills */}
        <BentoTile
          span="md" tone="plain" title="Skills" icon={Award}
          actions={
            <button type="button" onClick={() => setSkills((s) => [...s, { skill: '', proficiency: 'Intermediate' }])}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-brand-600 transition active:scale-[0.97] hover:bg-hover/[0.04]">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          }
        >
          {skills.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No skills added yet.</p>
          ) : (
            <div className="mt-1 flex flex-col gap-2">
              {skills.map((sk, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" value={sk.skill}
                    onChange={(e) => setSkills((s) => s.map((x, j) => (j === i ? { ...x, skill: e.target.value } : x)))}
                    className={field} placeholder="Skill name" />
                  <SearchableSelect value={sk.proficiency ?? 'Intermediate'}
                    onChange={(v) => setSkills((s) => s.map((x, j) => (j === i ? { ...x, proficiency: v } : x)))}
                    options={PROFICIENCIES.map((p) => ({ value: p, label: p }))} />
                  <button type="button" onClick={() => setSkills((s) => s.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-xl p-1.5 text-muted transition active:scale-[0.97] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Remove skill">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </BentoTile>

        {/* Education */}
        <BentoTile
          span="lg" tone="plain" title="Education" icon={BookOpen}
          actions={
            <button type="button" onClick={() => setEducation((s) => [...s, { level: '', institution: '', major: '', year: undefined }])}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold text-brand-600 transition active:scale-[0.97] hover:bg-hover/[0.04]">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          }
        >
          {education.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No education added yet.</p>
          ) : (
            <div className="mt-1 flex flex-col gap-3">
              {education.map((ed, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <SearchableSelect value={ed.level ?? ''} placeholder="Level"
                      onChange={(v) => setEducation((s) => s.map((x, j) => (j === i ? { ...x, level: v } : x)))}
                      options={EDU_LEVELS.map((l) => ({ value: l, label: l }))} />
                    <button type="button" onClick={() => setEducation((s) => s.filter((_, j) => j !== i))}
                      className="ml-auto shrink-0 rounded-xl p-1.5 text-muted transition active:scale-[0.97] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Remove education">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input type="text" value={ed.institution ?? ''}
                    onChange={(e) => setEducation((s) => s.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)))}
                    className={field} placeholder="Institution" />
                  <div className="flex gap-2">
                    <input type="text" value={ed.major ?? ''}
                      onChange={(e) => setEducation((s) => s.map((x, j) => (j === i ? { ...x, major: e.target.value } : x)))}
                      className={field} placeholder="Major / Field" />
                    <input type="number" value={ed.year ?? ''}
                      onChange={(e) => setEducation((s) => s.map((x, j) => (j === i ? { ...x, year: e.target.value ? Number(e.target.value) : undefined } : x)))}
                      className={field + ' w-24 shrink-0'} placeholder="Year" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </Page>
  )
}
