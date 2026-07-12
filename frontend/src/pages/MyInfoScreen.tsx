import { useEffect, useState } from 'react'
import { Phone, MapPin, CalendarDays, Award, BookOpen, ClipboardList, Trash2, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { SearchableSelect } from '@/components/SearchableSelect'
import { useBoot, useSaveMyProfile } from '@/hooks/useData'
import type { EmployeeChildSkill, EmployeeChildEducation, EmployeeChildTraining } from '@/lib/types'

// Moved verbatim from Profile.tsx (was the MyInfoCard module consts).
const INPUT_CLS =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-400 focus:bg-white dark:focus:bg-slate-800 placeholder:text-slate-400 dark:placeholder:text-slate-500'
const PROFICIENCIES = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const EDU_LEVELS = ['SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']
const RELIGIONS = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu']
const VERSE_SUPPORTED = new Set(['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha'])

export default function MyInfoScreen() {
  const { data: boot } = useBoot()
  const employee = boot?.employee
  const leave = boot?.leave
  const toast = useToast()
  const save = useSaveMyProfile()

  const [phone, setPhone] = useState(employee?.phone ?? '')
  const [birthdate, setBirthdate] = useState(employee?.birthdate ?? '')
  const [bio, setBio] = useState(employee?.bio ?? '')
  const [homeAddress, setHomeAddress] = useState(employee?.home_address ?? '')
  const [ecName, setEcName] = useState(employee?.emergency_contact_name ?? '')
  const [ecPhone, setEcPhone] = useState(employee?.emergency_contact_phone ?? '')
  const [ecRelation, setEcRelation] = useState(employee?.emergency_contact_relation ?? '')
  const [skills, setSkills] = useState<EmployeeChildSkill[]>(employee?.skills ?? [])
  const [education, setEducation] = useState<EmployeeChildEducation[]>(employee?.education ?? [])
  const [trainings, setTrainings] = useState<EmployeeChildTraining[]>(employee?.trainings ?? [])
  const [religion, setReligion] = useState(employee?.religion ?? '')
  const [verseEnabled, setVerseEnabled] = useState<boolean>(!!employee?.verse_enabled)

  // ponytail: one-shot hydration — useState ignores prop changes after first render; fire once when employee arrives
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

  const doSave = () => {
    save.mutate(
      { phone, birthdate, bio, home_address: homeAddress,
        emergency_contact_name: ecName, emergency_contact_phone: ecPhone, emergency_contact_relation: ecRelation,
        skills, education, trainings,
        religion, verse_enabled: verseEnabled ? 1 : 0 },
      {
        onSuccess: () => toast('success', 'Profile saved'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not save profile'),
      },
    )
  }

  return (
    <DetailScreen
      title="My Info"
      right={
        <button
          onClick={doSave}
          disabled={save.isPending || !hydrated}
          className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {save.isPending && <Spinner className="h-3.5 w-3.5" />}
          Save
        </button>
      }
    >
      <div className="flex flex-col">
      {/* Leave balance — read-only chip */}
      {leave && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-sky-50 dark:bg-sky-500/15 px-3 py-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="text-sm font-semibold text-sky-700 dark:text-sky-300">
            {leave.remaining} / {leave.quota} days leave
          </span>
          <span className="text-xs text-sky-500 dark:text-sky-400">{leave.used} used</span>
        </div>
      )}

      {/* Personal */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Personal</p>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            className={INPUT_CLS} placeholder="+62 xxx" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Birthdate</span>
          <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)}
            className={INPUT_CLS} />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
            className={INPUT_CLS + ' resize-none'} placeholder="Tell your team a bit about you" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Home Address</span>
          <textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2}
            className={INPUT_CLS + ' resize-none'} placeholder="Full address" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> Agama</span>
          <SearchableSelect value={religion} onChange={(v) => setReligion(v)} placeholder="— Pilih —"
            options={RELIGIONS.map((r) => ({ value: r, label: r }))} />
        </label>

        {VERSE_SUPPORTED.has(religion) ? (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
            <span className="text-sm font-medium text-stone-600 dark:text-slate-300">Ayat Harian</span>
            <input type="checkbox" checked={verseEnabled} onChange={(e) => setVerseEnabled(e.target.checked)}
              className="h-5 w-5 accent-brand-600" />
          </label>
        ) : religion ? (
          <p className="text-xs text-stone-400 dark:text-slate-500">Ayat Harian belum tersedia untuk agama ini.</p>
        ) : null}
      </div>

      {/* Emergency Contact */}
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Emergency Contact</p>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          Name
          <input type="text" value={ecName} onChange={(e) => setEcName(e.target.value)}
            className={INPUT_CLS} placeholder="Full name" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>
          <input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)}
            className={INPUT_CLS} placeholder="+62 xxx" />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-stone-600 dark:text-slate-300">
          Relation
          <input type="text" value={ecRelation} onChange={(e) => setEcRelation(e.target.value)}
            className={INPUT_CLS} placeholder="e.g. Spouse, Parent" />
        </label>
      </div>

      {/* Skills */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-3.5 w-3.5 text-stone-400 dark:text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Skills</p>
          </div>
          <button
            type="button"
            onClick={() => setSkills((s) => [...s, { skill: '', proficiency: 'Intermediate' }])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {skills.length > 0 && (
          <div className="flex flex-col gap-2">
            {skills.map((sk, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text" value={sk.skill}
                  onChange={(e) => setSkills((s) => s.map((x, j) => j === i ? { ...x, skill: e.target.value } : x))}
                  className={INPUT_CLS.replace('w-full', 'flex-1')}
                  placeholder="Skill name"
                />
                <SearchableSelect
                  value={sk.proficiency ?? 'Intermediate'}
                  onChange={(v) => setSkills((s) => s.map((x, j) => j === i ? { ...x, proficiency: v } : x))}
                  options={PROFICIENCIES.map((p) => ({ value: p, label: p }))}
                />
                <button
                  type="button"
                  onClick={() => setSkills((s) => s.filter((_, j) => j !== i))}
                  className="rounded-lg p-1.5 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Education */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-stone-400 dark:text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Education</p>
          </div>
          <button
            type="button"
            onClick={() => setEducation((s) => [...s, { level: '', institution: '', major: '', year: undefined }])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {education.length > 0 && (
          <div className="flex flex-col gap-3">
            {education.map((ed, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center gap-2">
                  <SearchableSelect
                    value={ed.level ?? ''}
                    onChange={(v) => setEducation((s) => s.map((x, j) => j === i ? { ...x, level: v } : x))}
                    placeholder="Level"
                    options={EDU_LEVELS.map((l) => ({ value: l, label: l }))}
                  />
                  <button
                    type="button"
                    onClick={() => setEducation((s) => s.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text" value={ed.institution ?? ''}
                  onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, institution: e.target.value } : x))}
                  className={INPUT_CLS}
                  placeholder="Institution"
                />
                <div className="flex gap-2">
                  <input
                    type="text" value={ed.major ?? ''}
                    onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, major: e.target.value } : x))}
                    className={INPUT_CLS.replace('w-full', 'flex-1')}
                    placeholder="Major / Field"
                  />
                  <input
                    type="number" value={ed.year ?? ''}
                    onChange={(e) => setEducation((s) => s.map((x, j) => j === i ? { ...x, year: e.target.value ? Number(e.target.value) : undefined } : x))}
                    className={INPUT_CLS.replace('w-full', 'w-20')}
                    placeholder="Year"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trainings */}
      {/* ponytail: no cert upload in v1; no generic private-upload helper exists for employee docs; add when upload_my_certificate endpoint is ready */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-stone-400 dark:text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Trainings</p>
          </div>
          <button
            type="button"
            onClick={() => setTrainings((s) => [...s, { title: '' }])}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 active:bg-brand-50 dark:active:bg-brand-500/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {trainings.length > 0 && (
          <div className="flex flex-col gap-3">
            {trainings.map((tr, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={tr.title}
                    onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                    className={INPUT_CLS.replace('w-full', 'flex-1')}
                    placeholder="Training title"
                  />
                  <button
                    type="button"
                    onClick={() => setTrainings((s) => s.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-stone-400 active:bg-rose-50 active:text-rose-600 dark:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text" value={tr.provider ?? ''}
                  onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, provider: e.target.value } : x))}
                  className={INPUT_CLS}
                  placeholder="Provider / organizer"
                />
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-xs text-stone-400 dark:text-slate-500">Date</span>
                    <input
                      type="date" value={tr.training_date ?? ''}
                      onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, training_date: e.target.value } : x))}
                      className={INPUT_CLS}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-xs text-stone-400 dark:text-slate-500">Expiry</span>
                    <input
                      type="date" value={tr.expiry_date ?? ''}
                      onChange={(e) => setTrainings((s) => s.map((x, j) => j === i ? { ...x, expiry_date: e.target.value } : x))}
                      className={INPUT_CLS}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </DetailScreen>
  )
}
