export const seconds = (s: number) => s * 1000;
export const minutes = (m: number) => seconds(60 * m);
export const hours = (h: number) => minutes(60 * h);
export const days = (d: number) => hours(24 * d);

export const delay = (ms: number) =>
    new Promise(resolve =>
        setTimeout(resolve, ms)
    );

export default {
    seconds,
    minutes,
    hours,
    days
};
