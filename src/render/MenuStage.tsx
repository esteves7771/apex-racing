import { useGame, race } from '../game/store';
import { tracks, trackId } from '../track/ActiveTrack';
import { CarVisual } from '../vehicle/CarVisual';
const stages = { pine: tracks.pine.poseAt(0.185), coast: tracks.coast.poseAt(0.115) };
export const menuPose = () => stages[trackId];
export function MenuStage() {
  const menu = useGame(() => ['MENU', 'MODE_SELECT'].includes(race.phase));
  const selected = useGame((s) => s.save.settings.track);
  const pose = stages[selected];
  return (
    <group
      visible={menu}
      position={[pose.p.x, pose.p.y + 0.44, pose.p.z]}
      rotation={[0, pose.yaw, 0]}
      name="cinematic-menu-vehicle"
    >
      <CarVisual preview />
    </group>
  );
}
