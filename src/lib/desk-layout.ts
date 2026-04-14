export type DeskSeed = {
  id: string;
  label: string;
  roomId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoomOutline = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WallSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export const DESK_LAYOUT: DeskSeed[] = [
  { id: "desk-01", label: "2", roomId: "room-1", x: 6.0, y: 7.8, width: 4.8, height: 9.8 },
  { id: "desk-02", label: "3", roomId: "room-1", x: 20.7, y: 7.8, width: 4.8, height: 9.8 },
  { id: "desk-03", label: "4", roomId: "room-2", x: 31.8, y: 7.8, width: 4.8, height: 9.8 },
  { id: "desk-04", label: "5", roomId: "room-2", x: 46.2, y: 7.5, width: 6.8, height: 5.8 },
  { id: "desk-05", label: "6", roomId: "room-2", x: 56.4, y: 7.5, width: 6.8, height: 5.8 },
  { id: "desk-06", label: "7", roomId: "room-3", x: 77.5, y: 7.8, width: 7.0, height: 5.8 },
  { id: "desk-07", label: "8", roomId: "room-3", x: 86.3, y: 13.8, width: 5.0, height: 10.2 },
  { id: "desk-08", label: "9", roomId: "room-1", x: 3.6, y: 24.5, width: 4.8, height: 10.6 },
  { id: "desk-09", label: "10", roomId: "room-1", x: 3.6, y: 37.8, width: 4.8, height: 10.6 },
  { id: "desk-10", label: "11", roomId: "room-1", x: 22.0, y: 24.5, width: 4.8, height: 10.6 },
  { id: "desk-11", label: "12", roomId: "room-1", x: 22.0, y: 37.8, width: 4.8, height: 10.6 },
  { id: "desk-12", label: "13", roomId: "room-2", x: 31.8, y: 25.2, width: 4.8, height: 10.6 },
  { id: "desk-13", label: "14", roomId: "room-2", x: 31.8, y: 37.8, width: 4.8, height: 10.6 },
  { id: "desk-14", label: "15", roomId: "room-1", x: 21.5, y: 62.5, width: 5.4, height: 11.8 },
  { id: "desk-15", label: "16", roomId: "room-6", x: 47.6, y: 58.2, width: 5.8, height: 10.8 },
  { id: "desk-16", label: "17", roomId: "room-4", x: 66.4, y: 31.8, width: 5.8, height: 11.0 },
  { id: "desk-17", label: "18", roomId: "room-4", x: 66.4, y: 44.8, width: 5.8, height: 11.0 },
  { id: "desk-18", label: "19", roomId: "room-4", x: 67.6, y: 66.8, width: 5.8, height: 11.2 },
  { id: "desk-19", label: "20", roomId: "room-4", x: 84.0, y: 31.8, width: 5.8, height: 11.0 },
  { id: "desk-20", label: "21", roomId: "room-4", x: 84.4, y: 45.8, width: 8.0, height: 6.2 },
];

export const ROOM_OUTLINES: RoomOutline[] = [];

export const OFFICE_WALL_SEGMENTS: WallSegment[] = [
  { id: "w1", x1: 1.5, y1: 2.8, x2: 31.6, y2: 2.8 },
  { id: "w2", x1: 31.6, y1: 2.8, x2: 31.6, y2: 76.8 },
  { id: "w3", x1: 31.6, y1: 76.8, x2: 1.5, y2: 76.8 },
  { id: "w4", x1: 1.5, y1: 76.8, x2: 1.5, y2: 2.8 },

  { id: "w5", x1: 1.5, y1: 24.3, x2: 31.6, y2: 24.3 },

  { id: "w6", x1: 31.6, y1: 2.8, x2: 74.9, y2: 2.8 },
  { id: "w7", x1: 74.9, y1: 2.8, x2: 74.9, y2: 31.0 },

  { id: "w8", x1: 76.7, y1: 2.8, x2: 96.9, y2: 2.8 },
  { id: "w9", x1: 96.9, y1: 2.8, x2: 96.9, y2: 31.0 },
  { id: "w10", x1: 96.9, y1: 31.0, x2: 76.7, y2: 31.0 },
  { id: "w11", x1: 76.7, y1: 31.0, x2: 76.7, y2: 2.8 },

  { id: "w12", x1: 64.0, y1: 31.0, x2: 96.9, y2: 31.0 },
  { id: "w13", x1: 96.9, y1: 31.0, x2: 96.9, y2: 96.8 },
  { id: "w14", x1: 96.9, y1: 96.8, x2: 64.0, y2: 96.8 },
  { id: "w15", x1: 64.0, y1: 96.8, x2: 64.0, y2: 31.0 },

  { id: "w16", x1: 31.6, y1: 55.7, x2: 49.8, y2: 55.7 },
  { id: "w17", x1: 49.8, y1: 55.7, x2: 49.8, y2: 76.8 },

  { id: "w18", x1: 49.8, y1: 46.5, x2: 64.0, y2: 46.5 },
  { id: "w19", x1: 64.0, y1: 46.5, x2: 64.0, y2: 76.8 },
  { id: "w20", x1: 49.8, y1: 76.8, x2: 64.0, y2: 76.8 },

  { id: "w21", x1: 31.6, y1: 76.8, x2: 31.6, y2: 96.8 },
  { id: "w22", x1: 31.6, y1: 96.8, x2: 64.0, y2: 96.8 },
];
