import { slideTravel } from '../movement';

it('starts the whole child beyond either viewport edge', () => {
  expect(slideTravel(340, 940, 1280, 50, 'left', false)).toBe(990);
  expect(slideTravel(340, 940, 1280, 50, 'right', false)).toBe(-990);
  expect(340 + slideTravel(340, 940, 1280, 50, 'left', false)).toBeGreaterThan(
    1280
  );
  expect(940 + slideTravel(340, 940, 1280, 50, 'right', false)).toBeLessThan(0);
});

it('limits fitted travel to available space, reserving room for easing overshoot', () => {
  expect(slideTravel(10, 1250, 1280, 50, 'left', true)).toBe(30);
  expect(slideTravel(10, 1250, 1280, 50, 'right', true)).toBe(-10);
  expect(slideTravel(10, 1250, 1280, 50, 'left', true, 1.5)).toBe(20);
  expect(slideTravel(0, 1280, 1280, 50, 'left', true)).toBe(0);
  expect(slideTravel(0, 1280, 1280, 50, 'right', true)).toBe(-0);
});
