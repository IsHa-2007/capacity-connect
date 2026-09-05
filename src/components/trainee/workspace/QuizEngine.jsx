import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Flag,
  RotateCcw,
  Timer,
  XCircle,
} from 'lucide-react'
import { Card, Badge, Button } from '../../common/ui'
import { generateAssessment, scoreAssessment } from '../../../utils/examGenerator'

const ASSESSMENT_TIME_SECONDS = 20 * 60 // 20 minutes

export default function QuizEngine({ course, existing, onPass, onFail }) {
  const bank = course.bank || []
  const [phase, setPhase] = useState('intro') // intro | running | result
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState([])
  const [current, setCurrent] = useState(0)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [timeLeft, setTimeLeft] = useState(ASSESSMENT_TIME_SECONDS)
  const timerRef = useRef(null)

  // The lock gate is managed by the parent workspace.
  const start = () => {
    const gen = generateAssessment(bank, 20)
    setAssessment(gen)
    setAnswers(Array(gen.questions.length).fill(null))
    setCurrent(0)
    setTimeLeft(ASSESSMENT_TIME_SECONDS)
    setPhase('running')
  }

  useEffect(() => {
    if (phase !== 'running') return
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? 0 : t - 1))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  const setAnswer = (index, option) => {
    setAnswers((a) => {
      const next = [...a]
      next[index] = option
      return next
    })
  }

  const submit = () => {
    clearInterval(timerRef.current)
    const result = scoreAssessment(answers, assessment.questions)
    setPhase('result')
    if (result.passed) onPass(result)
    else onFail(result)
  }

  useEffect(() => {
    if (phase === 'running' && timeLeft === 0) {
      clearInterval(timerRef.current)
      submit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase])

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (existing && phase === 'result') {
    // already attempted -> show stored result
    return <ResultView result={existing} course={course} onRetry={onFail} />
  }

  if (phase === 'intro') {
    return <IntroView onStart={start} />
  }

  if (phase === 'result' && assessment) {
    return (
      <ResultCard
        result={scoreAssessment(answers, assessment.questions)}
        onRetry={() => {
          setAssessment(null)
          setPhase('intro')
        }}
        onDone={onPass}
      />
    )
  }

  if (!assessment) return null

  const q = assessment.questions[current]
  const answered = answers.filter((a) => a !== null).length
  const progressPct = (answered / assessment.questions.length) * 100

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-light text-primary"><FileCheck size={18} /></span>
            <div>
              <h3 className="font-semibold text-primary-deep">Final Assessment</h3>
              <p className="text-xs text-slate-muted">{course.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${timeLeft < 300 ? 'bg-rose-50 text-rose-600' : 'bg-sky-light text-primary'}`}>
              <Timer size={15} /> {mmss(timeLeft)}
            </span>
            <span className="text-sm text-slate-muted">{answered}/{assessment.questions.length} answered</span>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-[#EAF0F6]">
          <div className="h-1.5 rounded-full bg-secondary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </Card>

      {/* Question */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge tone={q.difficulty === 'easy' ? 'green' : q.difficulty === 'medium' ? 'amber' : 'navy'}>{q.difficulty}</Badge>
            <span className="text-xs text-slate-muted">{q.tag?.text}</span>
          </div>
          <span className="text-xs text-slate-muted">Question {current + 1} of {assessment.questions.length}</span>
        </div>
        <h3 className="mt-4 text-base font-semibold text-primary-deep">{q.text}</h3>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {q.options.map((opt, oi) => (
            <button
              key={oi}
              onClick={() => setAnswer(current, oi)}
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                answers[current] === oi
                  ? 'border-primary bg-sky-light text-primary'
                  : 'border-border-soft bg-sky-soft text-slate-body hover:border-secondary/40 hover:bg-white'
              }`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${answers[current] === oi ? 'border-primary bg-primary text-white' : 'border-border-soft bg-white text-slate-muted'}`}>
                {String.fromCharCode(65 + oi)}
              </span>
              {opt}
            </button>
          ))}
        </div>
      </Card>

      {/* Question navigator */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-1.5">
          {assessment.questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-medium transition-colors ${
                i === current
                  ? 'bg-primary text-white'
                  : answers[i] !== null
                  ? 'bg-sky-light text-primary'
                  : 'bg-[#EAF0F6] text-slate-muted hover:bg-sky-light'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </Card>

      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button variant="subtle" onClick={() => setCurrent((v) => Math.max(0, v - 1))} disabled={current === 0}>
              <ChevronLeft size={16} /> Previous
            </Button>
            <Button variant="subtle" onClick={() => setCurrent((v) => Math.min(assessment.questions.length - 1, v + 1))} disabled={current === assessment.questions.length - 1}>
              Next <ChevronRight size={16} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-muted">{assessment.questions.length - answered} remaining</span>
            <Button onClick={() => setConfirmSubmit(true)}>
              <Flag size={15} /> Submit Assessment
            </Button>
          </div>
        </div>
      </Card>

      {/* Confirm modal */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-primary-deep/40 backdrop-blur-sm" onClick={() => setConfirmSubmit(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-border-soft bg-white p-6 shadow-2xl">
            <h3 className="font-semibold text-primary-deep">Submit Assessment?</h3>
            <p className="mt-2 text-sm text-slate-body">
              You have answered {answered} of {assessment.questions.length} questions. {assessment.questions.length - answered} unanswered will be marked as unattempted (0 marks).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="subtle" onClick={() => setConfirmSubmit(false)}>Keep Reviewing</Button>
              <Button onClick={submit}>Confirm Submit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function IntroView({ onStart }) {
  return (
    <Card className="p-8">
      <div className="mx-auto max-w-2xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-light text-primary">
          <FileCheck size={26} />
        </span>
        <h3 className="mt-4 text-center text-xl font-semibold text-primary-deep">Final Assessment</h3>
        <p className="mt-2 text-center text-sm text-slate-body">
          A dynamic, guarded competency evaluation generated from the trainer's question bank.
          Complete it carefully to demonstrate operational readiness.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <RuleCard title="Composition" lines={[`20% Easy`, `30% Medium`, `50% Hard`]} />
          <RuleCard title="Marking" lines={[`Correct +1`, `Wrong −0.25`, `Unattempted 0`]} />
          <RuleCard title="Requirements" lines={[`20 minutes`, `20 questions`, `Pass ≥ 75%`]} />
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle size={15} /> Important</p>
          <p className="mt-1">Once started, the timer cannot be paused. Unanswered questions receive 0 marks. Negative marking applies to incorrect answers.</p>
        </div>

        <div className="mt-6 text-center">
          <Button onClick={onStart} size="lg" className="px-6 py-2.5">Begin Assessment</Button>
        </div>
      </div>
    </Card>
  )
}

function RuleCard({ title, lines }) {
  return (
    <div className="rounded-xl border border-border-soft bg-sky-soft p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</p>
      <ul className="mt-2 space-y-1">
        {lines.map((l) => (
          <li key={l} className="text-sm text-slate-body">{l}</li>
        ))}
      </ul>
    </div>
  )
}

function ResultView({ result, course, onRetry }) {
  return (
    <Card className="p-8">
      <ResultInner result={result} course={course} onRetry={onRetry} />
    </Card>
  )
}

function ResultCard({ result, onRetry, onDone }) {
  return (
    <Card className="p-8">
      <ResultInner result={result} onRetry={onRetry} onDone={onDone} />
    </Card>
  )
}

function ResultInner({ result, onRetry, onDone }) {
  const passed = result.passed
  if (result === undefined) return null
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
        {passed ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
      </span>
      <h3 className={`mt-4 text-2xl font-semibold ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>
        {passed ? 'Assessment Passed' : 'Assessment Not Passed'}
      </h3>
      <p className="mt-2 text-sm text-slate-body">
        {passed ? 'Congratulations! Your final assessment met the passing threshold of 75%.' : 'Your score was below the 75% passing threshold. Review the areas below and retry.'}
      </p>

      <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
        <ScoreBox label="Correct" value={result.correct} tone="text-emerald-600" />
        <ScoreBox label="Incorrect" value={result.incorrect} tone="text-rose-600" />
        <ScoreBox label="Unattempted" value={result.unattempted} tone="text-slate-muted" />
      </div>

      <div className="mt-6">
        <p className="text-sm text-slate-muted">Final Score</p>
        <p className={`text-4xl font-semibold ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>{result.percentage}%</p>
        <div className="mx-auto mt-2 h-2.5 max-w-xs rounded-full bg-[#EAF0F6]">
          <div className={`h-2.5 rounded-full ${passed ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, result.percentage)}%` }} />
        </div>
      </div>

      <div className="mt-6">
        {passed ? (
          <>
            <p className="text-sm text-slate-body">
              <b className="text-primary-deep">Next step:</b> Submit the mandatory feedback to unlock your verified certificate.
            </p>
            {onDone && <Button onClick={onDone} className="mt-4">Continue to Feedback</Button>}
          </>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
              <p className="font-medium">Areas requiring improvement</p>
              <ul className="mt-1.5 list-disc pl-5 space-y-1">
                <li>Review topics where you answered incorrectly.</li>
                <li>Revisit the Study Notes and Slide Decks for foundational gaps.</li>
                <li>Complete the Practice Sets to reinforce understanding.</li>
              </ul>
            </div>
            <p className="mt-3 text-xs text-slate-muted">You may retake the assessment. The certificate remains locked until you pass.</p>
            {onRetry && <Button onClick={onRetry} className="mt-4" variant="secondary"><RotateCcw size={15} /> Retry Assessment</Button>}
          </>
        )}
      </div>
    </div>
  )
}

function ScoreBox({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-sky-soft p-3">
      <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
      <p className="text-xs text-slate-muted">{label}</p>
    </div>
  )
}
