import { describe, expect, test } from 'vitest'

import {
  currentStep,
  guideSteps,
  isGuideComplete,
  readGuideMemory,
  suggestedQuestionKey,
  writeGuideMemory,
  type GuideFacts
} from './onboarding-pure'

const FRESH: GuideFacts = {
  hasProject: true,
  runtimeOk: false,
  model: null,
  sourceCount: 0,
  filesIndexed: 0,
  asked: false,
  skipped: []
}

function stateOf(facts: GuideFacts, id: string): string | undefined {
  return guideSteps(facts).find((step) => step.id === id)?.state
}

describe('шаги мастера', () => {
  test('на чистой установке текущий шаг — ключ, проект уже сделан', () => {
    const steps = guideSteps(FRESH)

    expect(stateOf(FRESH, 'project')).toBe('done')
    expect(currentStep(steps)?.id).toBe('key')
    // Всё после текущего ждёт — иначе список выглядит как шесть равных дел.
    expect(stateOf(FRESH, 'model')).toBe('waiting')
    expect(stateOf(FRESH, 'ask')).toBe('waiting')
  })

  test('ключ считается сделанным по проверке ядра, а не по наличию строки', () => {
    // `runtimeOk` — ответ на «дошёл бы запрос до модели». Ключ, который не
    // работает, не должен закрывать шаг: следующим экраном человек упрётся в
    // ошибку, причину которой мастер уже спрятал.
    expect(stateOf({ ...FRESH, runtimeOk: true }, 'key')).toBe('done')
    expect(stateOf({ ...FRESH, runtimeOk: false }, 'key')).toBe('current')
  })

  test('модель из пробелов не закрывает шаг', () => {
    expect(stateOf({ ...FRESH, runtimeOk: true, model: '   ' }, 'model')).toBe('current')
    expect(stateOf({ ...FRESH, runtimeOk: true, model: 'gpt-5' }, 'model')).toBe('done')
  })

  test('источники и индекс закрываются фактом, а не кнопкой мастера', () => {
    // Человек мог подключить папку в панели «Источники» и проиндексировать из
    // индикатора — мастер обязан это увидеть.
    const facts = { ...FRESH, runtimeOk: true, model: 'gpt-5', sourceCount: 2, filesIndexed: 17 }

    expect(stateOf(facts, 'sources')).toBe('done')
    expect(stateOf(facts, 'index')).toBe('done')
    expect(currentStep(guideSteps(facts))?.id).toBe('ask')
  })

  test('пропуск источников уносит с собой индексацию', () => {
    const facts: GuideFacts = { ...FRESH, runtimeOk: true, model: 'gpt-5', skipped: ['sources'] }

    expect(stateOf(facts, 'sources')).toBe('skipped')
    expect(stateOf(facts, 'index')).toBe('skipped')
    // И человек не упирается в кнопку «Проиндексировать», которой нечего делать.
    expect(currentStep(guideSteps(facts))?.id).toBe('ask')
  })

  test('пропустить можно только источники и индексацию', () => {
    const steps = guideSteps(FRESH)
    expect(steps.filter((step) => step.optional).map((step) => step.id)).toEqual([
      'sources',
      'index'
    ])
  })

  test('пропущенный шаг, сделанный потом руками, снова считается сделанным', () => {
    const facts: GuideFacts = { ...FRESH, skipped: ['sources'], sourceCount: 1 }
    expect(stateOf(facts, 'sources')).toBe('done')
  })

  test('мастер закончен, когда текущего шага не осталось', () => {
    const done: GuideFacts = {
      hasProject: true,
      runtimeOk: true,
      model: 'gpt-5',
      sourceCount: 1,
      filesIndexed: 5,
      asked: true,
      skipped: []
    }

    expect(isGuideComplete(guideSteps(done))).toBe(true)
    expect(isGuideComplete(guideSteps(FRESH))).toBe(false)
    // Пропуск закрывает мастер так же, как выполнение.
    expect(
      isGuideComplete(
        guideSteps({ ...done, sourceCount: 0, filesIndexed: 0, skipped: ['sources'] })
      )
    ).toBe(true)
  })
})

describe('подсказанный вопрос', () => {
  test('без подключённых документов вопрос другой', () => {
    // Иначе первый же ответ — «я ничего не вижу», и это выглядит как поломка.
    expect(suggestedQuestionKey(0)).toBe('onboarding.askWithoutSources')
    expect(suggestedQuestionKey(3)).toBe('onboarding.askWithSources')
  })
})

describe('память между запусками', () => {
  test('пустое, чужое и испорченное хранилище читаются как «человек здесь впервые»', () => {
    for (const raw of [null, '', 'not json', '[]', '{"C:/v":42}']) {
      expect(readGuideMemory(raw, 'C:/v')).toEqual({ asked: false, closed: false, skipped: [] })
    }
  })

  test('запись про один проект не трогает остальные', () => {
    const first = writeGuideMemory(null, 'C:/a', { asked: true, closed: false, skipped: [] })
    const second = writeGuideMemory(first, 'C:/b', {
      asked: false,
      closed: true,
      skipped: ['sources']
    })

    expect(readGuideMemory(second, 'C:/a')).toEqual({ asked: true, closed: false, skipped: [] })
    expect(readGuideMemory(second, 'C:/b')).toEqual({
      asked: false,
      closed: true,
      skipped: ['sources']
    })
  })

  test('незнакомые имена шагов из хранилища отбрасываются', () => {
    const raw = JSON.stringify({ 'C:/v': { skipped: ['sources', 'выдумка', 7] } })
    expect(readGuideMemory(raw, 'C:/v').skipped).toEqual(['sources'])
  })
})
