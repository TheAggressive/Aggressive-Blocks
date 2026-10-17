/** Own only Cover background videos; inline media retains its own controls. */
export class BackgroundVideos {
  private readonly videos: { video: HTMLVideoElement; index: number }[];
  private activeIndex = -1;
  private playing = false;

  constructor(slides: HTMLElement[]) {
    this.videos = slides.flatMap((slide, index) =>
      Array.from(
        slide.querySelectorAll<HTMLVideoElement>(
          '.wp-block-cover__video-background'
        )
      )
        .filter(
          video => video.autoplay && video.closest('.aa-hero__slide') === slide
        )
        .map(video => ({ video, index }))
    );
    this.videos.forEach(({ video }) =>
      video.addEventListener('play', this.onPlay)
    );
  }

  private onPlay = (): void => {
    this.videos.forEach(({ video, index }) => {
      if (!this.playing || index !== this.activeIndex) video.pause();
    });
  };

  sync(activeIndex: number, playing: boolean): void {
    const changed =
      activeIndex !== this.activeIndex || playing !== this.playing;
    this.activeIndex = activeIndex;
    this.playing = playing;
    this.videos.forEach(({ video, index }) => {
      if (!playing || index !== activeIndex) {
        if (!video.paused) video.pause();
      } else if (changed && video.paused) {
        // Browser autoplay policy can reject even a muted background video.
        void video.play()?.catch(() => undefined);
      }
    });
  }

  destroy(): void {
    this.playing = false;
    this.videos.forEach(({ video }) => {
      video.removeEventListener('play', this.onPlay);
      video.pause();
    });
  }
}
