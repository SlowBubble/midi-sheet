import { Song } from "../song-sheet/song.js";
import { makeSimpleQng } from "../song-sheet/quantizedNoteGp.js";
import { clefType, Voice } from "../song-sheet/voice.js";
import { intervals } from "../chord/interval.js";

export class SongPart {
  constructor({
    song = {}, // Song, which can have a melody or rest. Comping will be added in SongForm.
    compingStyle = CompingStyle.default,
  }) {
    this.song = new Song(song);
    this.compingStyle = compingStyle;
  }

  // TODO remove
  updateComping() {
    const changes = this.song.chordChanges.changes;
    const bassQngs = [];
    const trebleQngs = [];

    const maxBass = 56;
    const minBass = 40;
    const maxTreble = 76;
    let prevBassNoteNum = 50;
    let prevTrebleNoteNums = [66];
    let isDenseBass = false;
    changes.forEach((change, idx) => {
      if (idx === 0 && this.song.pickup8n.lessThan(change.start8n)) {
        bassQngs.push(makeSimpleQng(this.song.pickup8n, change.start8n, []));
        trebleQngs.push(makeSimpleQng(this.song.pickup8n, change.start8n, []));
      }
      // Bass
      const end8n = idx + 1 < changes.length ? changes[idx + 1].start8n : this.song.getEnd8n();
      const chord = change.val;
      const bass = chord.bass || chord.root;
      const bassNoteNum = genNearestNums([bass.toNoteNum()], [prevBassNoteNum], minBass, maxBass);
      const dur8n = end8n.minus(change.start8n);
      if (dur8n.geq(6)) {
        isDenseBass = false;
      }
      if (dur8n.equals(4)) {
        if (isDenseBass) {
          isDenseBass = Math.random() < 0.85;
        } else {
          isDenseBass = Math.random() < 0.4;
        }
      }
      // Make this higher than bassNoteNum unless it's higher than maxBass
      let bassNoteNum2 = chord.root.toNoteNum(4);
      if ((dur8n.geq(6) || (isDenseBass && dur8n.equals(4))) && idx + 1 < changes.length) {
        if (chord.bass) {
          if (bassNoteNum2 > maxBass) {
            bassNoteNum2 -= 12;
          }
        } else {
          bassNoteNum2 = chord.root.toNoteNum(3) + chord.getFifthInterval();
          if (bassNoteNum2 < bassNoteNum && bassNoteNum2 + 12 < maxBass) {
            bassNoteNum2 += 12;
          }
        }
        const syncopated = dur8n.geq(6) ? Math.random() < 0.35 : Math.random() < 0.2;
        const dur8nFromEnd = syncopated ? 1 : 2;
        bassQngs.push(makeSimpleQng(change.start8n, end8n.minus(dur8nFromEnd), [bassNoteNum]));
        bassQngs.push(makeSimpleQng(end8n.minus(dur8nFromEnd), end8n, [bassNoteNum2]));
        prevBassNoteNum = bassNoteNum2;
      } else {
        bassQngs.push(makeSimpleQng(change.start8n, end8n, [bassNoteNum]));
        prevBassNoteNum = bassNoteNum;
      }
      
      const minTreble = Math.max(bassNoteNum, bassNoteNum2, 51) + 1;
      // Treble
      const third = chord.root.toNoteNum() + chord.getThirdInterval();
      const seventh = chord.root.toNoteNum() + chord.getSeventhInterval();
      const fifth = chord.root.toNoteNum() + chord.getFifthInterval();
      const interval9Or11 = chord.isMinor() || chord.isDiminished() ? intervals.P4 :  intervals.M2;
      const ninthOr11th = chord.root.toNoteNum() + interval9Or11;
      const trebleNoteNums = genNearestNums([third, seventh], prevTrebleNoteNums, minTreble, maxTreble);
      if (dur8n.geq(6) && idx + 1 < changes.length) {
        const useFifth = Math.random() < 0.6;
        const syncopated = Math.random() < 0.5;
        const color = useFifth ? fifth : ninthOr11th;
        let trebleNoteNums2 = genNearestNums([third, seventh, color], trebleNoteNums, minTreble, maxTreble);
        const topTrebleNoteNum = Math.max(...trebleNoteNums);
        const topTrebleNoteNum2 = Math.max(...trebleNoteNums2);
        if (topTrebleNoteNum === topTrebleNoteNum2) {
          if (Math.random() < 0.4) {
            trebleNoteNums2 = moveUp(trebleNoteNums2);
            if (Math.random() < 0.6) {
              trebleNoteNums2 = moveUp(trebleNoteNums2);
            }
          } else {
            trebleNoteNums2 = moveDown(trebleNoteNums2);
          }
        }
        const dur8nFromEnd = syncopated ? (dur8n.equals(6) ? 3 : 5) : 4;
        trebleQngs.push(makeSimpleQng(change.start8n, end8n.minus(dur8nFromEnd), trebleNoteNums));
        trebleQngs.push(makeSimpleQng(end8n.minus(dur8nFromEnd), end8n, trebleNoteNums2));
        prevTrebleNoteNums = trebleNoteNums2;
      } else {
        trebleQngs.push(makeSimpleQng(change.start8n, end8n, trebleNoteNums));
        prevTrebleNoteNums = trebleNoteNums;
      }
    });
    this.song.voices = [
      new Voice({noteGps: trebleQngs, clef: clefType.Treble}),
      new Voice({noteGps: bassQngs, clef: clefType.Bass}),
    ];
  }
}

function moveUp(noteNums) {
  const bottom = Math.min(...noteNums);
  const res = noteNums.filter(num => num !== bottom);
  res.push(bottom + 12);
  return res;
}

function moveDown(noteNums) {
  const top = Math.max(...noteNums);
  const res = noteNums.filter(num => num !== top);
  res.push(top - 12);
  return res;
}

function genNearestNums(noteNums, prevNoteNums, min, max) {
  return noteNums.map(noteNum => fixNoteNum(genNearestNum(noteNum, prevNoteNums), min, max));
}

function genNearestNum(noteNum, prevNoteNums) {
  let minDist = null;
  let ans = noteNum;
  prevNoteNums.forEach(prevNoteNum => {
    let curr = noteNum;
    while (Math.abs(curr - prevNoteNum) > Math.abs(curr + 12 - prevNoteNum)) {
      curr += 12;
    }
    while (Math.abs(curr - prevNoteNum) > Math.abs(curr - 12 - prevNoteNum)) {
      curr -= 12;
    }
    const dist = Math.abs(curr - prevNoteNum);
    if (minDist === null || dist <= minDist) {
      minDist = dist;
      ans = curr;
    }
  });
  return ans;
}

function fixNoteNum(noteNum, min, max) {
  while (noteNum < min) {
    noteNum += 12;
  }
  while (noteNum > max) {
    noteNum -= 12;
  }
  return noteNum;
}

// TODO move this to comping.js?
export const CompingStyle = Object.freeze({
  default: 'default',
})