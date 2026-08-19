import MultiplayerRoom from "./MultiplayerRoom";

export default async function MultiplayerPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <MultiplayerRoom roomId={roomId.toUpperCase()} />;
}
