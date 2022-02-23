export type Point = {
  x: number;
  y: number;
};

export type IndexObj = {
  index: number | undefined;
  isProximityBased: boolean;
};

export type GetStyles = (dz: HTMLElement) => Record<string, string>;
export type GetClasses = (dz: HTMLElement) => string[];
