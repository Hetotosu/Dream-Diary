/** 押したボタンに一度だけ「ぽん」と弾む動きを付ける（CSS の .pop） */
export function pop(el: HTMLElement) {
  el.classList.remove('pop');
  void el.offsetWidth; // 動きを最初からやり直すため、いったん描画させる
  el.classList.add('pop');
}
