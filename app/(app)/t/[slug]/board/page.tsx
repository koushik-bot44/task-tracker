import { BoardView } from "@/components/board/board-view";

export default function BoardPage({ params }: { params: { slug: string } }) {
  return <BoardView slug={params.slug} />;
}
