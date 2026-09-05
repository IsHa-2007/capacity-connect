// Dynamic 20:30:50 assessment generator
// 20% Easy, 30% Medium, 50% Hard

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Generate an assessment from a question bank.
 * - Tries to produce `total` questions (default 20) split 20% easy / 30% medium
 *   / 50% hard.
 * - If the bank is too small to fill `total` with distinct questions, the
 *   assessment is sized down to the number of available questions so it never
 *   requires more than what actually exists (a 5-question bank yields a 5
 *   question assessment: ~1 easy, ~2 medium, ~2 hard).
 * - If a specific difficulty pool is empty, it tops up from the whole bank so a
 *   valid assessment is always produced.
 * @param {Array} bank - question bank entries with difficulty, options, answer
 * @param {number} total - desired total question count
 * @returns {{questions, easy, medium, hard, total}}
 */
export function generateAssessment(bank, total = 20) {
  const pool = (bank || []).filter((q) => q && Array.isArray(q?.options) && q.options.length >= 2 && q.answer != null)
  if (!pool.length) return { questions: [], easy: 0, medium: 0, hard: 0, total: 0 }

  const size = Math.max(1, Math.min(total, pool.length))
  // 20:30:50 distribution, rounded to whole integers (hard = remainder).
  const easyCount = Math.round(size * 0.2)
  const mediumCount = Math.round(size * 0.3)
  const hardCount = size - easyCount - mediumCount

  const selected = []
  const take = (count, difficulty) => {
    if (count <= 0) return
    const byDiff = shuffle(pool.filter((q) => q.difficulty === difficulty))
    const source = byDiff.length ? byDiff : shuffle(pool)
    for (let i = 0; i < count; i++) selected.push(source[i % source.length])
  }
  take(easyCount, 'easy')
  take(mediumCount, 'medium')
  take(hardCount, 'hard')

  // randomize option order & track correct index
  const questions = shuffle(selected).map((q, idx) => {
    const order = shuffle(q.options.map((opt, i) => ({ opt, i })))
    const correctIndex = order.findIndex((o) => o.i === q.answer)
    return {
      id: `${q.id || idx}-${idx}`,
      text: q.text,
      topic: q.topic,
      tag: q.tag,
      difficulty: q.difficulty,
      options: order.map((o) => o.opt),
      answer: correctIndex,
    }
  })

  return { questions, easy: easyCount, medium: mediumCount, hard: hardCount, total: size }
}

/**
 * Score an assessment submission.
 * +1 correct, -0.25 incorrect, 0 unattempted.
 * @param {Array} answers - array of selected option indices (null = unattempted)
 * @param {Array} questions
 */
export function scoreAssessment(answers, questions) {
  let correct = 0
  let incorrect = 0
  let unattempted = 0
  let raw = 0

  questions.forEach((q, i) => {
    const given = answers[i]
    if (given === null || given === undefined) {
      unattempted++
      return
    }
    if (given === q.answer) {
      correct++
      raw += 1
    } else {
      incorrect++
      raw -= 0.25
    }
  })

  const maxScore = questions.length
  const percentage = maxScore > 0 ? Math.max(0, (raw / maxScore) * 100) : 0

  return {
    correct,
    incorrect,
    unattempted,
    raw: Number(raw.toFixed(2)),
    percentage: Number(percentage.toFixed(1)),
    passed: percentage >= 75,
  }
}

export const PASS_THRESHOLD = 75
