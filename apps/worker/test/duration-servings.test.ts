import { describe, expect, it } from 'vitest';
import { parseDurationMinutes, parseIsoDuration, recipeTotalMinutes } from '../src/duration';
import { parseServings } from '../src/servings';

describe('ISO 8601 durations', () => {
  it.each<[string, number | null]>([
    ['PT45M', 45],
    ['PT1H30M', 90],
    ['PT1H', 60],
    ['PT90M', 90],
    ['P0DT1H15M', 75],
    ['P1DT2H', 1560],
    ['PT0.5H', 30],
    ['PT1H0M30S', 61],
    ['PT90S', 2],
    ['P0Y0M0DT0H35M0.000S', 35],
    ['pt20m', 20],
    ['P30M', 30], // months written for minutes: a common site bug
    ['PT0M', null],
    ['PT', null],
    ['P', null],
    ['P1Y', null],
    ['1H30M', null],
    ['', null],
  ])('%j → %j', (value, minutes) => {
    expect(parseIsoDuration(value)).toBe(minutes);
  });

  it('reads human text and numbers too', () => {
    expect(parseDurationMinutes('1 hour 30 minutes')).toBe(90);
    expect(parseDurationMinutes('1 hora y 20 minutos')).toBe(80);
    expect(parseDurationMinutes('1h30')).toBe(90);
    expect(parseDurationMinutes('45 mins')).toBe(45);
    expect(parseDurationMinutes('25')).toBe(25);
    expect(parseDurationMinutes(40)).toBe(40);
    expect(parseDurationMinutes('a while')).toBeNull();
    expect(parseDurationMinutes(null)).toBeNull();
  });

  it('uses totalTime, else prepTime + cookTime', () => {
    expect(recipeTotalMinutes({ totalTime: 'PT45M', prepTime: 'PT5M', cookTime: 'PT10M' })).toBe(45);
    expect(recipeTotalMinutes({ prepTime: 'PT15M', cookTime: 'PT1H' })).toBe(75);
    expect(recipeTotalMinutes({ cookTime: 'PT20M' })).toBe(20);
    expect(recipeTotalMinutes({ totalTime: 'PT0M', prepTime: 'PT10M' })).toBe(10);
    expect(recipeTotalMinutes({})).toBeNull();
  });
});

describe('recipeYield → servings', () => {
  it.each<[unknown, number | null]>([
    [4, 4],
    ['4', 4],
    ['4 servings', 4],
    ['4-6', 4],
    ['4 - 6 servings', 4],
    ['4 to 6 servings', 4],
    ['Serves 6', 6],
    ['Serves four', 4],
    ['8 porciones', 8],
    ['Rinde 6 porciones', 6],
    ['Para 4 personas', 4],
    ['6 personnes', 6],
    [['4', '4 servings'], 4],
    [['6 porciones'], 6],
    [[6], 6],
    ['24 cookies', null],
    [['24', '24 cookies'], null],
    ['12 tacos', null],
    [{ '@type': 'QuantitativeValue', value: 4 }, 4],
    [0, null],
    [120, null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%j → %j', (value, servings) => {
    expect(parseServings(value)).toBe(servings);
  });
});
