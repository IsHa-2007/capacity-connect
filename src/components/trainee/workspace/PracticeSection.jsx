import { useState } from 'react'
import { ArrowRight, CheckCircle2, ClipboardCheck, Eye, RotateCcw } from 'lucide-react'
import { Button, Card, Badge } from '../../common/ui'
import InAppFileViewer from '../../profile/InAppFileViewer'

// Practice Sets section: shows trainer-uploaded practice files plus an untimed
// practice quiz drawn from the course question bank. Always accessible.
export default function PracticeSection({ course, done, onComplete, onProceedToAssessment }) {
  const bank = course.bank || []
  const practiceFiles = course.practice || []
  const subset = bank.slice(0, 5)
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState(false)
  const [viewing, setViewing] = useState(null)
  const correct = subset.filter((q, i) => answers[i] === q.answer).length

  const reset = () => {
    setAnswers({})
    setRevealed(false)
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <ClipboardCheck size={18} className="text-primary" /> Practice Files
            </h3>
            <p className="text-sm text-slate-muted">Printable practice material uploaded by the trainer.</p>
          </div>
        </div>
        {practiceFiles.length ? (
          <div className="mt-4 space-y-2">
            {practiceFiles.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-border-soft bg-sky-soft px-4 py-3">
                <button onClick={() => setViewing(m)} className="flex items-center gap-3 text-left">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-primary"><ClipboardCheck size={16} /></span>
                  <span className="text-sm font-medium text-primary-deep">{m.title || m.name}</span>
                </button>
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-sky-light" onClick={() => setViewing(m)}>
                  <Eye size={14} /> View
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-muted">No practice files uploaded yet.</p>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-primary-deep">
              <ClipboardCheck size={18} className="text-primary" /> Practice Quiz
            </h3>
            <p className="text-sm text-slate-muted">Untimed practice from the question bank. This does not count toward your final assessment.</p>
          </div>
          <Badge tone="blue">{bank.length} questions in bank</Badge>
        </div>

        {subset.length ? (
          <>
            <div className="mt-5 space-y-4">
              {subset.map((q, qi) => (
                <div key={q.id || qi} className="rounded-xl border border-border-subtle bg-sky-soft p-4">
                  <div className="flex items-start gap-2">
                    <Badge tone={q.difficulty === 'easy' ? 'green' : q.difficulty === 'medium' ? 'amber' : 'navy'}>
                      {q.difficulty}
                    </Badge>
                    <p className="text-sm font-medium text-primary-deep">Q{qi + 1}. {q.text}</p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt, oi) => {
                      const isCorrect = revealed && oi === q.answer
                      const isWrong = revealed && answers[qi] === oi && oi !== q.answer
                      return (
                        <button
                          key={oi}
                          onClick={() => !revealed && setAnswers((a) => ({ ...a, [qi]: oi }))}
                          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            isCorrect
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : isWrong
                              ? 'border-rose-300 bg-rose-50 text-rose-700'
                              : answers[qi] === oi
                              ? 'border-primary bg-sky-light text-primary'
                              : 'border-border-soft bg-white text-slate-body hover:bg-sky-light'
                          }`}
                        >
                          <span className="mr-1.5 font-semibold">{String.fromCharCode(65 + oi)}.</span>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
              <div className="flex items-center gap-3">
                {!revealed ? (
                  <Button variant="secondary" onClick={() => setRevealed(true)} disabled={Object.keys(answers).length === 0}>
                    <CheckCircle2 size={16} /> Check Answers
                  </Button>
                ) : (
                  <>
                    <Badge tone={correct >= 4 ? 'green' : 'amber'}>
                      Score: {correct} / {subset.length}
                    </Badge>
                    <Button variant="subtle" onClick={reset}><RotateCcw size={15} /> Reset</Button>
                  </>
                )}
              </div>
              {revealed && (
                <>
                  {onComplete && (
                    <Button onClick={onComplete}>
                      {done ? 'Completed' : 'Complete Practice'} <ArrowRight size={16} />
                    </Button>
                  )}
                  {onProceedToAssessment && done && (
                    <Button
                      variant="secondary"
                      onClick={onProceedToAssessment}
                      className="ml-2"
                    >
                      Proceed to Assessment <ArrowRight size={16} />
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border-soft bg-sky-soft p-6 text-center">
            <p className="text-sm text-slate-muted">No practice questions available yet.</p>
            <p className="mt-1 text-xs text-slate-muted">The trainer has not added questions to the practice/assessment bank for this course.</p>
          </div>
        )}
      </Card>

      <InAppFileViewer
        open={!!viewing}
        onClose={() => setViewing(null)}
        fileURL={viewing?.fileURL}
        fileType={viewing?.fileType}
        title={viewing?.title || viewing?.name}
        fileName={viewing?.name}
      />
    </div>
  )
}
