import type { MessageTable } from '../types';

/**
 * Sentence templates for the AI layer's findings.
 *
 * Each finding is a complete sentence in both languages with the figures as
 * placeholders — never assembled from fragments. Korean is SOV with particles,
 * so English-ordered pieces glued together produce something no Korean reader
 * would accept. A separate whole-sentence template per finding is the only way
 * the Korean reads as if it were written, not translated.
 */
export const aiFindings: MessageTable = {
  /* ---------------- summaries ---------------- */
  'sum.leave': {
    en: '{type} leave for {name}, {range}. {workingDays} working day(s) of {calendarDays} calendar days{holidays}. Balance after approval: {after} of {allowance} days.',
    ko: '{name}님의 {type} 신청입니다. 기간은 {range}, 총 {calendarDays}일 중 근무일 {workingDays}일{holidays}. 승인 시 잔여 연차는 {allowance}일 중 {after}일이 됩니다.',
  },
  'sum.leave.holidays': { en: ', excluding {count} public holiday(s)', ko: '이며 공휴일 {count}일 제외' },
  'sum.leave.collisions': {
    en: ' {count} colleague(s) in {dept} are already off in this window.',
    ko: ' 같은 기간에 {dept} 소속 {count}명이 이미 휴가 중입니다.',
  },
  'sum.leave.headline': { en: '{days}d {type} leave', ko: '{type} {days}일' },

  'sum.trip': {
    en: '{scope} trip to {city}, {country} for {days} day(s). {count} traveller(s): {names}. Purpose: {purpose} Estimated cost {total} ({perTraveller} per traveller).',
    // Place names stay in the familiar "City, Country" form rather than being
    // reordered — the seeded data is in English and "Korea Seoul" reads wrong.
    ko: '{city}, {country} {scope} 출장 {days}일입니다. 출장자 {count}명: {names}. 목적은 {purpose} 예상 비용은 총 {total}, 1인당 {perTraveller}입니다.',
  },
  'sum.trip.headline': { en: '{city} · {days}d · {total}', ko: '{city} · {days}일 · {total}' },

  'sum.purchase': {
    en: '{quantity} × {item} at {unitPrice} each, total {total}. Vendor: {vendor}. {quotations} quotation(s) attached. {purpose}',
    ko: '{item} {quantity}개, 단가 {unitPrice}, 합계 {total}입니다. 거래처는 {vendor}이며 견적서 {quotations}건이 첨부되었습니다. {purpose}',
  },
  'sum.purchase.noVendor': { en: 'not selected', ko: '미지정' },
  'sum.purchase.headline': { en: '{category} purchase · {total}', ko: '{category} 구매 · {total}' },

  'sum.expense': {
    en: '{count} expense line(s) totalling {total}. Categories: {categories}. {trip} Paid by {method}.',
    ko: '경비 {count}건, 합계 {total}입니다. 분류는 {categories}이며, {trip} 결제 수단은 {method}입니다.',
  },
  'sum.expense.linked': { en: 'Linked to business trip {number}.', ko: '출장 {number}에 연결되어 있습니다.' },
  'sum.expense.notLinked': { en: 'Not linked to a business trip.', ko: '연결된 출장은 없습니다.' },
  'sum.expense.headline': { en: '{count} lines · {total}', ko: '{count}건 · {total}' },

  'sum.generic': {
    en: '{title}. {description}{amount}',
    ko: '{title}. {description}{amount}',
  },
  'sum.generic.amount': { en: ' Amount: {total}.', ko: ' 금액은 {total}입니다.' },
  'sum.generic.noDetail': { en: 'No further detail provided.', ko: '추가로 기재된 내용은 없습니다.' },

  /* ---------------- policy checks ---------------- */
  'chk.hotel.over': {
    en: '{rate} per night against a {cap} cap — {over} over (+{pct}%), {total} across {nights} night(s).',
    ko: '1박 {rate}로 상한 {cap}보다 {over}({pct}%) 높습니다. {nights}박 기준 총 {total} 초과입니다.',
  },
  'chk.hotel.ok': { en: '{rate} per night, within the {cap} cap.', ko: '1박 {rate}로 상한 {cap} 이내입니다.' },
  'chk.meal.over': { en: '{perDay} per day against a {cap} allowance.', ko: '1일 {perDay}로 한도 {cap}을 초과합니다.' },
  'chk.meal.ok': { en: '{perDay} per day, within the {cap} allowance.', ko: '1일 {perDay}로 한도 {cap} 이내입니다.' },
  'chk.flightClass': {
    en: 'Fare class is not recorded on the request — economy assumed. Verify against the itinerary if in doubt.',
    ko: '기안에 좌석 등급이 기재되어 있지 않아 이코노미로 간주했습니다. 확인이 필요하면 항공 일정표를 대조하세요.',
  },
  'chk.quotes.missing': {
    en: '{total} exceeds the {threshold} threshold but only {count} quotation is attached. Two are required.',
    ko: '{total}은 기준 {threshold}을 초과하는데 견적서가 {count}건뿐입니다. 2건이 필요합니다.',
  },
  'chk.quotes.ok': { en: 'Above {threshold} with {count} quotations attached.', ko: '{threshold} 초과 건으로 견적서 {count}건이 첨부되었습니다.' },
  'chk.quotes.below': { en: '{total} is below the {threshold} two-quotation threshold.', ko: '{total}은 견적 2건 기준인 {threshold} 미만입니다.' },
  'chk.leaveRun.over': {
    en: '{days} consecutive working days exceeds the {limit}-day limit. Director approval required.',
    ko: '연속 근무일 {days}일로 제한 {limit}일을 초과합니다. 임원 승인이 필요합니다.',
  },
  'chk.leaveRun.ok': { en: '{days} working days, within the {limit}-day limit.', ko: '근무일 {days}일로 제한 {limit}일 이내입니다.' },
  'chk.budget.over': {
    en: '{amount} exceeds the remaining {category} budget of {remaining} for this quarter.',
    ko: '{amount}은 이번 분기 {category} 잔여 예산 {remaining}을 초과합니다.',
  },
  'chk.budget.ok': {
    en: '{remaining} remaining; {pct}% of the quarterly {category} budget used after approval.',
    ko: '잔여 {remaining}이며, 승인 시 분기 {category} 예산의 {pct}%가 사용됩니다.',
  },

  /* ---------------- structural checks ---------------- */
  'chk.label.leaveBalance': { en: 'Leave balance', ko: '연차 잔여' },
  'chk.leaveBalance.over': { en: 'Request exceeds the remaining balance by {days} day(s).', ko: '잔여 연차보다 {days}일 초과합니다.' },
  'chk.leaveBalance.ok': { en: '{after} of {allowance} days remaining after approval.', ko: '승인 시 {allowance}일 중 {after}일이 남습니다.' },

  'chk.label.coverage': { en: 'Team coverage', ko: '업무 공백' },
  'chk.coverage.warn': { en: '{people} already off in this window.', ko: '같은 기간에 {people}이(가) 이미 휴가 중입니다.' },
  'chk.coverage.ok': { en: 'No overlapping leave in the department.', ko: '같은 부서에 겹치는 휴가가 없습니다.' },

  'chk.label.holidays': { en: 'Public holidays', ko: '공휴일' },
  'chk.holidays.detail': { en: '{names} fall in this range and are not deducted.', ko: '{names}이(가) 기간에 포함되며 연차에서 차감되지 않습니다.' },

  'chk.label.costHistory': { en: 'Cost vs. history', ko: '과거 비용 대비' },
  'chk.costHistory.warn': {
    en: '{perTraveller} per traveller against a {average} average across {count} previous {city} trip(s) — {pct}% higher.',
    ko: '1인당 {perTraveller}로, {city} 출장 {count}건 평균 {average}보다 {pct}% 높습니다.',
  },
  'chk.costHistory.ok': {
    en: '{perTraveller} per traveller against a {average} average ({pct}%).',
    ko: '1인당 {perTraveller}로, 평균 {average} 대비 {pct}%입니다.',
  },
  'chk.costHistory.none': { en: 'No previous approved trips to {city} to compare against.', ko: '{city} 출장 승인 이력이 없어 비교할 대상이 없습니다.' },

  'chk.label.overlapTravel': { en: 'Overlapping travel', ko: '출장 중복' },
  'chk.overlapTravel.warn': {
    en: '{people} also travelling to {city} in this window — consider combining.',
    ko: '같은 기간에 {people}도 {city}로 출장합니다. 일정 통합을 검토해 보세요.',
  },

  'chk.label.documents': { en: 'Supporting documents', ko: '증빙 자료' },
  'chk.documents.ok': { en: '{count} file(s) attached.', ko: '{count}건이 첨부되었습니다.' },
  'chk.documents.none': { en: 'No itinerary or quotation attached.', ko: '항공 일정표나 견적서가 첨부되지 않았습니다.' },

  'chk.label.priceHistory': { en: 'Price vs. history', ko: '과거 단가 대비' },
  'chk.priceHistory.warn': {
    en: '{unitPrice} per unit against {previous} previously paid — {pct}% higher. Consider requesting another quotation.',
    ko: '단가 {unitPrice}로 과거 {previous}보다 {pct}% 높습니다. 추가 견적을 받아 보시기 바랍니다.',
  },
  'chk.priceHistory.ok': { en: '{unitPrice} per unit against {previous} previously paid ({pct}%).', ko: '단가 {unitPrice}로 과거 {previous} 대비 {pct}%입니다.' },
  'chk.priceHistory.none': { en: 'No comparable prior purchase on record.', ko: '비교할 만한 과거 구매 이력이 없습니다.' },

  'chk.label.vendor': { en: 'Vendor', ko: '거래처' },
  'chk.vendor.ok': { en: '{name} is a registered vendor.', ko: '{name}은(는) 등록된 거래처입니다.' },
  'chk.vendor.none': { en: 'No vendor selected on this request.', ko: '거래처가 지정되지 않았습니다.' },

  'chk.label.duplicate': { en: 'Duplicate check', ko: '중복 검사' },
  'chk.duplicate.found': { en: 'Matching receipt already claimed on {claims}.', ko: '동일한 영수증이 이미 {claims}에 청구되었습니다.' },
  'chk.duplicate.entry': { en: '{number} ({merchant}, {date}, {amount})', ko: '{number}({merchant}, {date}, {amount})' },
  'chk.duplicate.none': { en: 'No matching receipt found on any other claim.', ko: '다른 정산서에서 동일한 영수증을 찾지 못했습니다.' },

  'chk.label.receipts': { en: 'Receipts', ko: '영수증' },
  'chk.receipts.missing': { en: '{count} line(s) have no attached receipt.', ko: '영수증이 첨부되지 않은 항목이 {count}건 있습니다.' },
  'chk.receipts.ok': { en: 'Receipts attached for all {count} line(s).', ko: '{count}건 모두 영수증이 첨부되었습니다.' },

  /* ---------------- comparisons ---------------- */
  'cmp.perTraveller': { en: 'Cost per traveller', ko: '1인당 비용' },
  'cmp.cityAverage': { en: '{city} average ({count} trips)', ko: '{city} 평균 ({count}건)' },
  'cmp.hotelPerNight': { en: 'Hotel per night', ko: '1박 숙박비' },
  'cmp.largestLine': { en: 'Largest line ({category})', ko: '최대 항목 ({category})' },
  'cmp.unitPrice': { en: 'Unit price', ko: '단가' },
  'cmp.previouslyPaid': { en: 'Previously paid ({count})', ko: '과거 단가 ({count}건)' },
  'cmp.workingDays': { en: 'Working days', ko: '근무일수' },
  'cmp.balanceBefore': { en: 'Balance before this request', ko: '신청 전 잔여' },
  'cmp.balanceAfter': { en: 'Balance after approval', ko: '승인 후 잔여' },
  'cmp.budgetRemaining': { en: '{category} budget remaining', ko: '{category} 예산 잔여' },
  'cmp.quarterUtilisation': { en: 'Quarter utilisation', ko: '분기 소진율' },
  'cmp.requesterHistory': { en: "{name}'s history", ko: '{name}님 기안 이력' },
  'cmp.approvedOf': { en: '{approved}/{total} approved', ko: '{total}건 중 {approved}건 승인' },
  'cmp.days': { en: '{n} days', ko: '{n}일' },

  /* ---------------- reasoning ---------------- */
  'reason.blocking': { en: '{count} blocking issue(s): {items}.', ko: '차단 사유 {count}건: {items}.' },
  'reason.warnings': { en: '{count} item(s) to check: {items}.', ko: '확인 필요 {count}건: {items}.' },
  'reason.clean': { en: 'No policy, budget or duplicate concerns were found.', ko: '정책·예산·중복 관련 문제가 발견되지 않았습니다.' },
  'reason.budgetBreach': {
    en: 'The amount is above the {remaining} left in the quarterly {category} budget.',
    ko: '금액이 분기 {category} 예산 잔여 {remaining}을 초과합니다.',
  },
  'reason.budgetOk': { en: 'Department budget covers this: {remaining} remains this quarter.', ko: '부서 예산으로 충당 가능합니다. 이번 분기 잔여 {remaining}입니다.' },
  'reason.approve': { en: 'Recommended for approval. The final decision is yours.', ko: '승인을 권장합니다. 최종 결정은 결재자의 판단입니다.' },
  'reason.review': { en: 'Read the flagged items before deciding. The final decision is yours.', ko: '표시된 항목을 확인한 뒤 결정하세요. 최종 결정은 결재자의 판단입니다.' },

  /* ---------------- copilot answers ---------------- */
  'cop.cost.trip': {
    en: 'At {perTraveller} per traveller this is {pct}% {direction} the {city} average of {average}. The largest single component is {largest}.',
    ko: '1인당 {perTraveller}로 {city} 평균 {average}보다 {pct}% {direction}. 가장 큰 항목은 {largest}입니다.',
  },
  'cop.cost.above': { en: 'above', ko: '높습니다' },
  'cop.cost.below': { en: 'below', ko: '낮습니다' },
  'cop.cost.tripNoHistory': {
    en: 'This is {perTraveller} per traveller. There are no previous approved trips to {city} to compare against, so treat the figure on its own merits.',
    ko: '1인당 {perTraveller}입니다. {city} 출장 승인 이력이 없어 비교 기준이 없으므로 금액 자체로 판단하셔야 합니다.',
  },
  'cop.cost.purchase': {
    en: 'The unit price is {unitPrice} against {previous} paid previously — {pct}% difference.',
    ko: '단가는 {unitPrice}로 과거 {previous} 대비 {pct}% 차이입니다.',
  },
  'cop.cost.purchaseNoHistory': {
    en: 'The total is {total}. No comparable prior purchase exists to benchmark it against.',
    ko: '합계는 {total}입니다. 비교할 과거 구매 이력이 없습니다.',
  },
  'cop.cost.plain': { en: 'The amount on this request is {total}.', ko: '이 기안의 금액은 {total}입니다.' },
  'cop.evidence.total': { en: 'Total {total} across {count} traveller(s) = {perTraveller} each.', ko: '총 {total}, 출장자 {count}명 기준 1인당 {perTraveller}.' },
  'cop.evidence.largest': { en: 'Largest component: {category} at {amount}.', ko: '최대 항목: {category} {amount}.' },
  'cop.evidence.cityAvg': { en: 'Average for {city}: {average} per traveller over {count} trip(s).', ko: '{city} 평균: {count}건 기준 1인당 {average}.' },
  'cop.evidence.hotel': { en: 'Hotel {rate}/night × {nights} night(s).', ko: '숙박 1박 {rate} × {nights}박.' },
  'cop.evidence.item': { en: '{quantity} × {item} at {unitPrice} = {total}.', ko: '{item} {quantity}개 × {unitPrice} = {total}.' },
  'cop.evidence.prevUnit': { en: 'Previously paid {previous} per unit ({count} prior purchase(s)).', ko: '과거 단가 {previous} ({count}건).' },

  'cop.policy.none': { en: 'No company policies are configured for this request type.', ko: '이 기안 유형에 설정된 사내 정책이 없습니다.' },
  'cop.policy.some': {
    en: "{count} policy rule(s) apply to this request type. The Policy check panel shows the result of each against this request's own figures.",
    ko: '이 유형에는 {count}개 정책이 적용됩니다. 검사 항목 패널에서 각 정책의 판정 결과를 확인할 수 있습니다.',
  },

  'cop.budget.none': { en: 'No budget line is configured for this department and category this quarter.', ko: '이번 분기 해당 부서·분류의 예산 항목이 설정되어 있지 않습니다.' },
  'cop.budget.answer': {
    en: '{remaining} remains in the {category} budget for this quarter. Approving this request would leave {after}.',
    ko: '이번 분기 {category} 예산 잔여는 {remaining}입니다. 승인하면 {after}이 남습니다.',
  },
  'cop.budget.allocated': { en: 'Allocated {amount}', ko: '배정 {amount}' },
  'cop.budget.spent': { en: 'Spent {amount}', ko: '집행 {amount}' },
  'cop.budget.committed': { en: 'Committed {amount}', ko: '약정 {amount}' },
  'cop.budget.utilisation': { en: 'Utilisation {pct}%', ko: '소진율 {pct}%' },

  'cop.history.trip': {
    en: 'There are {count} previous approved trip(s) to {city}, averaging {average} per traveller.',
    ko: '{city} 출장 승인 이력이 {count}건 있으며 1인당 평균 {average}입니다.',
  },
  'cop.history.tripThis': { en: 'This request: {perTraveller} per traveller.', ko: '이번 기안: 1인당 {perTraveller}.' },
  'cop.history.purchase': {
    en: 'This item was purchased {count} time(s) before, averaging {average} per unit.',
    ko: '이 품목은 과거 {count}회 구매되었으며 평균 단가는 {average}입니다.',
  },
  'cop.history.purchaseEntry': { en: '{number} on {date} — {price}{vendor}', ko: '{number} {date} — {price}{vendor}' },
  'cop.history.fromVendor': { en: ' from {name}', ko: ' ({name})' },
  'cop.history.requester': {
    en: '{name} has submitted {total} previous request(s), {approved} approved, averaging {average}.',
    ko: '{name}님은 이전에 {total}건을 기안했고 {approved}건이 승인되었으며 평균 금액은 {average}입니다.',
  },

  'cop.overlap.trips': { en: '{count} other traveller(s) are away during this window.', ko: '같은 기간에 다른 출장자 {count}명이 부재합니다.' },
  'cop.overlap.tripEntry': { en: '{name} — {city} from {date}', ko: '{name} — {date}부터 {city}' },
  'cop.overlap.leave': { en: '{count} colleague(s) in the same department are already off in this window.', ko: '같은 부서에서 {count}명이 이 기간에 휴가 중입니다.' },
  'cop.overlap.leaveEntry': { en: '{name} — {range}', ko: '{name} — {range}' },
  'cop.overlap.none': { en: 'Nobody else is away during this window.', ko: '같은 기간에 부재 예정인 사람은 없습니다.' },

  'cop.duplicate.found': { en: 'Yes — {count} matching receipt(s) were found on other claims.', ko: '예 — 다른 정산서에서 동일 영수증 {count}건이 발견되었습니다.' },
  'cop.duplicate.entry': { en: '{number}: {merchant}, {date}, {amount}', ko: '{number}: {merchant}, {date}, {amount}' },
  'cop.duplicate.none': { en: 'No duplicate receipts were found for this claim.', ko: '이 정산서에서 중복 영수증은 발견되지 않았습니다.' },

  'cop.summary.answer': { en: '{title} — {name}{dept}, {total}. {description}', ko: '{title} — {name}{dept}, {total}. {description}' },
  'cop.summary.status': { en: 'Status: {status}', ko: '상태: {status}' },
  'cop.summary.chain': { en: 'Approval chain: {chain}', ko: '결재선: {chain}' },
  'cop.chain.answer': { en: 'The approval route is {chain}.', ko: '결재선은 {chain}입니다.' },
  'cop.chain.entry': { en: '{step}: {status}', ko: '{step}: {status}' },
};
