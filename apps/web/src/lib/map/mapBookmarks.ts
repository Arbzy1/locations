export type MapBookmark = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export const MAX_MAP_BOOKMARKS = 20;
