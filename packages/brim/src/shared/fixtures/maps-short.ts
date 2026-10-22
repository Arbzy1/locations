/** Dummy short Maps URL only. Never a real person's share link. */
export const MAPS_SHORT_DUMMY = "https://maps.app.goo.gl/brimtest";
export const MAPS_SHORT_TARGET = "https://www.google.com/maps/dir/Crawley/London/";

export const MAPS_SHORT_FIXTURES = {
  redirects: {
    [MAPS_SHORT_DUMMY]: MAPS_SHORT_TARGET,
  },
};
