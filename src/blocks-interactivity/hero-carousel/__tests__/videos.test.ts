/** @jest-environment jsdom */
import { BackgroundVideos } from '../videos';

function fixture() {
  const root = document.createElement('div');
  root.innerHTML = [0, 1]
    .map(
      () =>
        '<div class="aa-hero__slide"><video class="wp-block-cover__video-background" autoplay></video><video controls></video></div>'
    )
    .join('');
  const slides = Array.from(root.children) as HTMLElement[];
  const videos = Array.from(root.querySelectorAll('video'));
  videos.forEach(video => {
    let paused = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    video.pause = jest.fn(() => {
      paused = true;
    });
    video.play = jest.fn(() => {
      paused = false;
      return Promise.resolve();
    });
  });
  return { slides, videos };
}

it('plays only the active background, holds playback and cleans up', () => {
  const { slides, videos } = fixture();
  const media = new BackgroundVideos(slides);
  media.sync(0, true);
  expect(videos[0].paused).toBe(false);
  expect(videos[2].paused).toBe(true);
  media.sync(1, true);
  expect(videos[0].paused).toBe(true);
  expect(videos[2].paused).toBe(false);
  media.sync(1, false);
  expect(videos[2].paused).toBe(true);
  // A delayed native autoplay event must not revive an inactive background.
  void videos[0].play();
  videos[0].dispatchEvent(new Event('play'));
  expect(videos[0].paused).toBe(true);
  expect(videos[1].pause).not.toHaveBeenCalled();
  expect(videos[3].pause).not.toHaveBeenCalled();
  media.sync(1, true);
  media.destroy();
  expect(videos[2].paused).toBe(true);
});

it('leaves non-autoplay backgrounds alone and handles blocked playback', async () => {
  const { slides, videos } = fixture();
  videos[0].autoplay = false;
  videos[2].pause();
  videos[2].play = jest.fn(() => Promise.reject(new Error('NotAllowedError')));
  const media = new BackgroundVideos(slides);
  media.sync(1, true);
  await Promise.resolve();
  expect(videos[0].pause).not.toHaveBeenCalled();
  expect(videos[2].play).toHaveBeenCalledTimes(1);
  media.sync(1, true);
  expect(videos[2].play).toHaveBeenCalledTimes(1);
  media.destroy();
});
