import os

from llama_index.core import (
    SimpleDirectoryReader,
    StorageContext,
    VectorStoreIndex,
    load_index_from_storage,
)
from llama_index.core.node_parser import MarkdownNodeParser
from llama_index.embeddings.openai import OpenAIEmbedding

from app.config import settings

# Metadata we keep for citations but don't want polluting the embeddings/LLM text
NOISE = ["file_path", "file_type", "file_size", "creation_date", "last_modified_date"]

STORAGE_DIR = os.path.join(settings.data_dir, "..", "storage")


def build_index() -> VectorStoreIndex:
    embed = OpenAIEmbedding(
        # OpenAIEmbedding (unlike the OpenAI LLM class) does NOT validate model
        # names, so NVIDIA's "nvidia/nemotron-3-embed-1b" passes through fine.
        model_name=settings.embed_model,
        api_key=settings.nvidia_embedding_api_key,
        api_base=settings.nvidia_base_url,
    )

    # Reuse the persisted index if it exists — re-embedding on every start
    # burns through the free-tier quota (429 RESOURCE_EXHAUSTED).
    # IMPORTANT: delete backend/storage/ after changing data/ or embed_model,
    # otherwise you keep using stale embeddings from the old model.
    if os.path.isdir(STORAGE_DIR) and os.listdir(STORAGE_DIR):
        storage = StorageContext.from_defaults(persist_dir=STORAGE_DIR)
        index = load_index_from_storage(storage, embed_model=embed)
        assert isinstance(index, VectorStoreIndex)  # we persist one of these ourselves
        return index

    docs = SimpleDirectoryReader(
        settings.data_dir, required_exts=[".md"]
    ).load_data()

    # Policy title = the first "# " heading of each file — used in citations and /documents.
    for d in docs:
        first_line = d.text.strip().splitlines()[0]
        d.metadata["policy_title"] = first_line.lstrip("# ").strip()

    # One chunk per markdown section
    nodes = MarkdownNodeParser().get_nodes_from_documents(docs)

    for n in nodes:
        header_path = n.metadata.get("header_path", "/").strip("/")
        n.metadata["section"] = header_path.split("/")[-1] if header_path else "Overview"
        n.excluded_embed_metadata_keys = NOISE + ["file_name"]
        n.excluded_llm_metadata_keys = NOISE

    index = VectorStoreIndex(nodes, embed_model=embed)
    # Persist so the next startup can skip re-embedding (see cache note above).
    index.storage_context.persist(persist_dir=STORAGE_DIR)
    return index
