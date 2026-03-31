#!/usr/bin/env node
/**
 * OpenClaw-Native Harness Orchestrator
 *
 * OpenClaw의 sessions_spawn/sessions_send를 활용하여
 * 에이전트 간 실시간 소통 + 학습 전달을 구현하는 오케스트레이터.
 *
 * OpenClaw 환경 내에서 실행될 때 사용하는 가이드 문서.
 * 실제 실행은 OpenClaw의 스킬 시스템을 통해 이루어진다.
 *
 * 이 파일은 OpenClaw 에이전트가 참조하는 오케스트레이션 로직 명세서다.
 */

/**
 * OpenClaw 오케스트레이션 흐름:
 *
 * 1. 사용자가 "하네스 실행" 요청
 * 2. OpenClaw이 이 파일의 로직에 따라 세션들을 관리
 *
 * ─── Phase 1: Planning ───
 *
 * sessions_spawn({
 *   task: buildPlannerPrompt(),   // planner.md + task_template + AGENTS.md
 *   label: "harness-plan",
 *   mode: "run",                  // 일회성 실행
 *   cwd: PROJECT_ROOT,
 * })
 *
 * → 완료 대기 (sessions_yield)
 * → plan.md 산출물 수집
 *
 * ─── Phase 2: Implementation ───
 *
 * sessions_spawn({
 *   runtime: "acp",
 *   agentId: "claude-code",       // Claude Code ACP 하네스
 *   task: buildImplPrompt(plan, review, learnings),
 *   label: "harness-impl",
 *   mode: "run",
 *   cwd: PROJECT_ROOT,
 * })
 *
 * → 실시간 모니터링 가능 (subagents list)
 * → 중간 질문 발생 시 sessions_send로 응답
 * → 완료 시 자동 알림
 *
 * ─── Phase 3: Review ───
 *
 * sessions_spawn({
 *   runtime: "acp",
 *   agentId: "codex",             // Codex ACP 하네스
 *   task: buildReviewPrompt(plan, diff, testResult),
 *   label: "harness-review",
 *   mode: "run",
 *   cwd: PROJECT_ROOT,
 * })
 *
 * → review 산출물에서 verdict 추출
 * → FAIL → Phase 2로 복귀 (sessions_send로 피드백 전달)
 * → PASS → 학습 축적 + 커밋
 *
 * ─── 에이전트 간 실시간 소통 ───
 *
 * sessions_send({
 *   label: "harness-impl",
 *   message: "리뷰 결과: CRITICAL 이슈 2건. review.md 내용: ..."
 * })
 *
 * → Claude 구현 세션이 살아있으면 즉시 피드백 수신
 * → 파일 저장/읽기 없이 메시지 기반 전달
 *
 * ─── 학습 전달 ───
 *
 * sessions_send({
 *   label: "harness-impl",
 *   message: "이전 반복 학습: 1) JWT 토큰 만료 처리 누락 패턴 주의 ..."
 * })
 *
 * → 구현 시작 전에 learnings.md 내용을 메시지로 주입
 * → 파일 참조보다 직접 주입이 컨텍스트 손실 없이 전달됨
 */

export const ORCHESTRATION_SPEC = {
  name: 'harness-pipeline-openclaw',
  version: '1.0.0',

  phases: [
    {
      id: 'plan',
      agent: 'gemini',
      spawnConfig: {
        mode: 'run',
        label: 'harness-plan',
      },
      inputs: ['planner.md', 'task_template.md', 'AGENTS.md'],
      output: 'plan-{timestamp}.md',
    },
    {
      id: 'implement',
      agent: 'claude-code',
      spawnConfig: {
        runtime: 'acp',
        agentId: 'claude-code',
        mode: 'run',
        label: 'harness-impl',
      },
      inputs: ['implementer.md', 'plan-latest.md', 'learnings.md', 'review-latest.md?'],
      output: 'impl-{timestamp}.md',
    },
    {
      id: 'review',
      agent: 'codex',
      spawnConfig: {
        runtime: 'acp',
        agentId: 'codex',
        mode: 'run',
        label: 'harness-review',
      },
      inputs: ['reviewer.md', 'plan-latest.md', 'git-diff', 'test-result'],
      output: 'review-{timestamp}.md',
    },
  ],

  loop: {
    retryPhases: ['implement', 'review'],
    maxIterations: 3,
    passConditions: ['PASS', 'WARNING_ONLY'],
    failAction: 'notify-user',
  },

  realTimeCommunication: {
    /**
     * 에이전트 간 실시간 메시지 패턴:
     *
     * 1. Plan → Impl: plan.md 전체 내용을 메시지로 전달
     * 2. Review → Impl: 리뷰 피드백을 메시지로 전달 (파일 저장 불필요)
     * 3. Impl → Review: 구현 완료 알림 + diff 요약
     * 4. Any → User: 진행 상황 보고 (Discord/Telegram 등)
     */
    patterns: [
      { from: 'plan', to: 'implement', content: 'plan-output' },
      { from: 'review', to: 'implement', content: 'review-feedback' },
      { from: 'implement', to: 'review', content: 'impl-complete-notification' },
      { from: '*', to: 'user', content: 'progress-update' },
    ],
  },

  learnings: {
    /**
     * 학습 축적 흐름:
     *
     * 1. review 완료 후 CRITICAL/WARNING 이슈 자동 추출
     * 2. learnings.md에 구조화하여 추가
     * 3. 다음 implement Phase 시작 시 learnings.md를 컨텍스트로 주입
     * 4. sessions_send로 직접 전달 (파일 참조 + 메시지 이중 전달)
     */
    extractFrom: 'review-output',
    storeTo: '.harness/learnings.md',
    injectTo: 'implement-context',
    deliveryMethod: 'file + sessions_send',
  },
};
