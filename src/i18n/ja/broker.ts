import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'ポジションはすでに決済されています',
  'broker.orderNotWorking': 'この注文はすでに有効ではありません',
  'broker.tickUnknownReprice': 'ティックサイズが不明なため、価格を変更できません',
  'broker.pricesUnknownReprice': '注文価格が不明なため、価格を変更できません',
  'broker.noLimitBand': '制限幅の基準となる現在の指値価格がありません',
  'broker.noStopBand': '制限幅の基準となる現在の逆指値価格がありません',
  'broker.noStopAnchor': '逆指値の基準となる価格がありません',
  'broker.tickUnknown': 'ティックサイズが不明です',
  'broker.noAnchor': '基準価格なし',
  'broker.takeProfitAbove': 'テイクプロフィットはエントリー価格より上に設定してください',
  'broker.takeProfitBelow': 'テイクプロフィットはエントリー価格より下に設定してください',
  'broker.positionClosed': 'ポジションを決済しました',
  'broker.orderCancelled': '注文をキャンセルしました',
  'broker.targetMoved': 'ターゲットを{price}に移動しました',
  'broker.orderMoved': '注文を{price}に移動しました',
  'broker.triggerMoved': 'トリガーを{price}に移動しました',
  'broker.limitMoved': '指値を{price}に移動しました',
  'broker.stopMoved': '逆指値を{price}に移動しました',
  'broker.stopSideUnverified': 'リアルタイム価格がないため、逆指値の方向が未確認です',
}
