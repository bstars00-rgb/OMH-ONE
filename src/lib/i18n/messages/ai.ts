import type { MessageTable } from '../types';

/**
 * AI-facing copy, including the sentence templates the deterministic provider
 * uses to phrase its findings.
 *
 * Korean sentences are written as complete units with the numbers as
 * placeholders, not as concatenated fragments. Korean is SOV with particles, so
 * assembling a sentence from English-ordered pieces produces something no Korean
 * reader would accept — each finding therefore gets its own whole-sentence
 * template in both languages.
 */
export const ai: MessageTable = {
  /* --- panel chrome --- */
  'ai.summary': { en: 'Summary', ko: '요약' },
  'ai.evidence': { en: 'Evidence', ko: '근거' },
  'ai.risk': { en: 'Risk', ko: '위험' },
  'ai.recommendedAction': { en: 'Recommended action', ko: '권장 조치' },
  'ai.review': { en: 'AI review', ko: 'AI 검토' },
  'ai.checks': { en: 'Checks', ko: '검사 항목' },
  'ai.allClear': { en: 'All clear', ko: '이상 없음' },
  'ai.failedCount': { en: '{count} failed', ko: '실패 {count}건' },
  'ai.warningCount': { en: '{count} warning', ko: '경고 {count}건' },
  'ai.comparison': { en: 'How it compares', ko: '비교 분석' },
  'ai.confidence': { en: 'Confidence', ko: '신뢰도' },
  'ai.recommendApprove': { en: 'Recommend approval', ko: '승인 권장' },
  'ai.recommendReject': { en: 'Recommend rejection', ko: '반려 권장' },
  'ai.recommendReview': { en: 'Needs your review', ko: '검토 필요' },
  'ai.notDecision': {
    en: 'This is a recommendation, not a decision. A person must approve or reject. Nothing here changes the request on its own.',
    ko: '이것은 권고이며 결정이 아닙니다. 승인 또는 반려는 사람이 해야 합니다. 이 화면의 내용만으로 기안이 변경되지 않습니다.',
  },
  'ai.why': { en: 'Why this recommendation?', ko: '이렇게 판단한 이유' },
  'ai.assessedBy': {
    en: 'Assessed by the {provider} from this request’s own figures: policy thresholds, department budget, historical comparisons and duplicate checks.',
    ko: '{provider}가 이 기안의 실제 수치로 판단했습니다. 정책 기준값, 부서 예산, 과거 이력 비교, 중복 검사를 근거로 합니다.',
  },
  'ai.providerRules': { en: 'built-in rules engine', ko: '내장 규칙 엔진' },
  'ai.providerModel': { en: 'configured model', ko: '설정된 모델' },
  'ai.noExternal': { en: ' No external service was called.', ko: ' 외부 서비스를 호출하지 않았습니다.' },
  'ai.useful': { en: 'Was this useful?', ko: '도움이 되었나요?' },
  'ai.helpful': { en: 'This review was helpful', ko: '도움이 되었습니다' },
  'ai.notHelpful': { en: 'This review was not helpful', ko: '도움이 되지 않았습니다' },
  'ai.thanks': { en: 'Thanks — recorded.', ko: '의견이 반영되었습니다.' },
  'ai.regenerate': { en: 'Re-run this analysis against current data', ko: '현재 데이터로 분석 다시 실행' },
  'ai.refreshed': { en: 'Analysis refreshed.', ko: '분석이 갱신되었습니다.' },
  'ai.refreshFailed': { en: 'Could not refresh the analysis.', ko: '분석을 갱신하지 못했습니다.' },
  'ai.degraded': {
    en: 'The model was unreachable — this analysis was produced by the built-in rules engine.',
    ko: '모델에 연결하지 못해 내장 규칙 엔진이 분석했습니다.',
  },
  'ai.unavailableTitle': { en: 'AI review not available', ko: 'AI 검토를 사용할 수 없습니다' },
  'ai.unavailableBody': {
    en: 'Analysis could not be generated for this request. Approvals are unaffected — you can still decide using the request detail.',
    ko: '이 기안의 분석을 생성하지 못했습니다. 결재에는 영향이 없으며, 기안 내용을 보고 결정하실 수 있습니다.',
  },

  /* --- copilot --- */
  'ai.askAbout': { en: 'Ask about this request', ko: '이 기안에 대해 질문' },
  'ai.askPlaceholder': { en: 'Ask a question…', ko: '질문을 입력하세요…' },
  'ai.askAria': { en: 'Ask a question about this request', ko: '이 기안에 대해 질문' },
  'ai.send': { en: 'Send question', ko: '질문 보내기' },
  'ai.suggest.expensive': { en: 'Why is this expensive?', ko: '왜 비싼가요?' },
  'ai.suggest.policy': { en: 'Does this breach any policy?', ko: '정책 위반이 있나요?' },
  'ai.suggest.budget': { en: 'How much budget remains?', ko: '예산은 얼마나 남았나요?' },
  'ai.suggest.compare': { en: 'Compare with previous requests', ko: '과거 기안과 비교해 주세요' },
  'ai.suggest.whoElse': { en: 'Who else is away on these dates?', ko: '같은 기간에 누가 부재중인가요?' },
  'ai.fallbackAnswer': {
    en: 'I can answer questions about this request’s cost, policy compliance, budget impact, history, duplicates and approval route. Try "why is this expensive?", "does this breach policy?", or "how much budget remains?".',
    ko: '이 기안의 비용, 정책 준수, 예산 영향, 과거 이력, 중복 여부, 결재선에 대해 답변할 수 있습니다. "왜 비싼가요?", "정책 위반이 있나요?", "예산은 얼마나 남았나요?" 같은 질문을 해보세요.',
  },

  /* --- morning brief --- */
  'brief.label': { en: 'AI brief', ko: 'AI 브리핑' },
  'brief.greetingMorning': { en: 'Good morning, {name}', ko: '{name}님, 좋은 아침입니다' },
  'brief.greetingAfternoon': { en: 'Good afternoon, {name}', ko: '{name}님, 안녕하세요' },
  'brief.greetingEvening': { en: 'Good evening, {name}', ko: '{name}님, 수고 많으셨습니다' },
  'brief.waiting': { en: '{count} requests waiting for your review.', ko: '결재를 기다리는 기안이 {count}건 있습니다.' },
  'brief.nothingWaiting': { en: 'Nothing is waiting for your review.', ko: '결재 대기 중인 기안이 없습니다.' },
  'brief.reviewApprovals': { en: 'Review approvals', ko: '결재하러 가기' },
  'brief.askAi': { en: 'Ask AI', ko: 'AI에게 질문' },
  'brief.footnote': {
    en: 'Generated from your visible data by the {provider}. Findings are computed from live records — nothing here is an estimate.',
    ko: '조회 가능한 데이터를 {provider}가 분석했습니다. 모든 수치는 실제 기록에서 계산된 값이며 추정치가 아닙니다.',
  },

  /* --- brief findings --- */
  'brief.overdue.title': { en: '{count} approvals have passed their SLA', ko: '기한이 지난 결재가 {count}건 있습니다' },
  'brief.overdue.detail': {
    en: 'Out of {total} waiting on you. These are already late for the requester.',
    ko: '대기 중인 {total}건 중 일부입니다. 기안자 입장에서는 이미 지연된 상태입니다.',
  },
  'brief.pending.title': { en: '{count} approvals waiting on you', ko: '결재 대기 {count}건' },
  'brief.pending.detail': {
    en: 'Sorted by risk and SLA, so the most consequential are at the top.',
    ko: '위험도와 기한 순으로 정렬되어 중요한 건이 위에 표시됩니다.',
  },
  'brief.spend.title': { en: 'Approved spend is {pct}% {direction} last month', ko: '승인 집행액이 전월 대비 {pct}% {direction}' },
  'brief.spend.above': { en: 'above', ko: '증가했습니다' },
  'brief.spend.below': { en: 'below', ko: '감소했습니다' },
  'brief.spend.detail': { en: '{current} month to date against {previous}.', ko: '당월 누계 {current}, 전월 {previous}.' },
  'brief.spend.topContributor': { en: ' Largest contributor: {name} at {amount}.', ko: ' 최대 비중: {name} {amount}.' },
  'brief.travel.title': { en: '{count} trips starting this month', ko: '이번 달 출발 예정 출장 {count}건' },
  'brief.budget.title': {
    en: '{dept} has used {pct}% of its quarterly {category} budget',
    ko: '{dept} 분기 {category} 예산 {pct}% 소진',
  },
  'brief.budget.over': {
    en: 'Over by {amount}. Further approvals in this category will breach the plan.',
    ko: '{amount} 초과했습니다. 이 분류에서 추가 승인 시 계획을 벗어납니다.',
  },
  'brief.budget.left': { en: '{remaining} left of {allocated}.', ko: '배정 {allocated} 중 {remaining} 남았습니다.' },
  'brief.leave.title': { en: '{count} people in {dept} are away in the next 10 days', ko: '{dept} 향후 10일 내 부재 예정 {count}명' },
  'brief.leave.detail': {
    en: '{names}. Check coverage before approving further leave.',
    ko: '{names}. 추가 휴가 승인 전 업무 공백을 확인하세요.',
  },
  'brief.leave.andMore': { en: ' and {count} more', ko: ' 외 {count}명' },
  'brief.bottleneck.title': { en: '{role} approvals take {hours}h on average', ko: '{role} 결재에 평균 {hours}시간 소요' },
  'brief.bottleneck.detail': { en: 'Across {count} decisions in the last six months', ko: '최근 6개월 {count}건 기준' },
  'brief.bottleneck.overdue': { en: ', with {count} currently past SLA', ko: ', 현재 기한 초과 {count}건' },
  'brief.duplicates.title': {
    en: '{count} expense lines match a receipt already claimed elsewhere',
    ko: '다른 정산서와 중복된 경비 항목 {count}건',
  },
  'brief.duplicates.detail': {
    en: 'Same merchant, date and amount on a different claim. Open the claim to see both.',
    ko: '사용처·일자·금액이 동일한 건이 다른 정산서에 있습니다. 정산서를 열면 두 건을 함께 볼 수 있습니다.',
  },
  'brief.returned.title': { en: '{count} of your requests were returned', ko: '보완 요청된 내 기안 {count}건' },
  'brief.returned.detail': {
    en: 'An approver asked for changes. Edit and resubmit to continue.',
    ko: '결재자가 보완을 요청했습니다. 수정 후 다시 상신하세요.',
  },
  'brief.clear.title': { en: 'Nothing needs your attention', ko: '확인이 필요한 항목이 없습니다' },
  'brief.clear.detail': {
    en: 'No overdue approvals, budget breaches or unusual activity in your scope.',
    ko: '기한 초과 결재, 예산 초과, 이상 징후가 없습니다.',
  },

  /* --- assistant page --- */
  'assist.title': { en: 'Ask OHMY AI', ko: 'OHMY AI에게 질문' },
  'assist.subtitle': {
    en: 'Ask questions about company data in plain language. Answers are limited to {scope}.',
    ko: '회사 데이터를 자연어로 질문하세요. 답변은 {scope} 범위로 제한됩니다.',
  },
  'assist.whatCanIAsk': { en: 'What can I ask?', ko: '무엇을 물어볼 수 있나요?' },
  'assist.intro': {
    en: 'I answer from the records you are permitted to see ({scope}). Every answer comes back as a summary, the evidence behind it, any risk, and a recommended action.',
    ko: '조회 권한이 있는 데이터({scope})를 기준으로 답변합니다. 모든 답변은 요약, 근거, 위험, 권장 조치 순으로 제공됩니다.',
  },
  'assist.placeholder': {
    en: 'Ask about spend, travel, leave, budgets, vendors or approvals…',
    ko: '집행액, 출장, 연차, 예산, 거래처, 결재에 대해 질문하세요…',
  },
  'assist.aria': { en: 'Ask a question about company data', ko: '회사 데이터에 대해 질문' },
  'assist.answeredBy': {
    en: 'Answered by query {intent} against your visible records. The model selects a query from a fixed set — it never writes SQL and never sees data outside your permissions.',
    ko: '{intent} 질의로 조회 가능한 데이터를 검색했습니다. 모델은 미리 정의된 질의 목록에서 선택할 뿐, SQL을 작성하지 않으며 권한 밖 데이터를 볼 수 없습니다.',
  },
  'assist.localNote': {
    en: 'Running the built-in query engine — no external service is called. Set AI_PROVIDER=anthropic with an API key for model-written prose over the same figures.',
    ko: '내장 질의 엔진으로 동작 중이며 외부 서비스를 호출하지 않습니다. 동일한 수치에 모델이 작성한 문장을 원하면 AI_PROVIDER=anthropic과 API 키를 설정하세요.',
  },
  'assist.querying': { en: 'Querying your records…', ko: '데이터를 조회하는 중…' },
  'assist.suggest1': { en: 'Give me this month’s management summary', ko: '이번 달 경영 요약을 알려주세요' },
  'assist.suggest2': { en: 'Why did travel expenses change last month?', ko: '지난달 출장비가 왜 변했나요?' },
  'assist.suggest3': { en: 'How much did SCM spend this quarter?', ko: 'SCM이 이번 분기에 얼마를 썼나요?' },
  'assist.suggest4': { en: 'Which approvals are delayed?', ko: '지연된 결재는 무엇인가요?' },
  'assist.suggest5': { en: 'Show requests over $5,000', ko: '$5,000 초과 기안을 보여주세요' },
  'assist.suggest6': { en: 'Which employee used the most annual leave?', ko: '연차를 가장 많이 쓴 직원은 누구인가요?' },
  'assist.suggest7': { en: 'What is the budget position?', ko: '예산 현황은 어떤가요?' },
  'assist.suggest8': { en: 'Who are our top vendors?', ko: '주요 거래처는 어디인가요?' },
  'assist.unknown': {
    en: 'I can’t answer that from the available data. I can report on spend by department, spend trends and why they moved, travel cost and destinations, leave usage, budget position, vendors, delayed approvals and what is pending.',
    ko: '보유한 데이터로는 답변할 수 없습니다. 부서별 집행액, 집행 추이와 변동 원인, 출장비와 목적지, 연차 사용, 예산 현황, 거래처, 지연 결재, 대기 건에 대해 답변할 수 있습니다.',
  },
  'assist.tryThis': { en: 'Try: "{example}"', ko: '예시: "{example}"' },
  'assist.tooLong': { en: 'That question is too long. Try asking it in one sentence.', ko: '질문이 너무 깁니다. 한 문장으로 물어봐 주세요.' },
  'assist.getStarted': { en: 'Ask a question to get started.', ko: '질문을 입력해 주세요.' },
  'assist.failed': {
    en: 'I could not run that query. Approvals and every other function are unaffected.',
    ko: '질의를 실행하지 못했습니다. 결재를 비롯한 다른 기능에는 영향이 없습니다.',
  },
  'assist.failedAction': { en: 'Try rephrasing, or open the Analytics page directly.', ko: '다르게 질문하시거나 분석 페이지를 직접 확인해 주세요.' },

  /* --- module names --- */
  'module.approval': { en: 'Approvals', ko: '결재' },
  'module.people': { en: 'HR and leave', ko: '인사·연차' },
  'module.travel': { en: 'Business travel', ko: '출장' },
  'module.expense': { en: 'Expenses', ko: '경비' },
  'module.purchase': { en: 'Purchasing', ko: '구매' },
  'module.finance': { en: 'Accounting', ko: '회계' },
  'module.ai': { en: 'AI assistant', ko: 'AI 어시스턴트' },
  'module.planned': { en: 'Planned', ko: '예정' },
};
