from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Preferences(StrictModel):
    nickname: str = Field(default="Explorador", min_length=1, max_length=40)
    education_level: str | None = Field(default=None, max_length=80)
    difficulty: Literal["facil", "media", "dificil"] = "media"
    topic_difficulty: dict[str, Literal["facil", "media", "dificil"]] = Field(default_factory=dict, max_length=20)
    interests: list[str] = Field(default_factory=list, max_length=10)


class Source(StrictModel):
    id: str
    file_id: str
    filename: str
    page: int | None
    method: Literal["text", "ocr"]
    excerpt: str = Field(min_length=1, max_length=2000)
    origin: Literal["uploaded_material"] = "uploaded_material"


class LearningObjective(StrictModel):
    description: str = Field(min_length=1, max_length=400)
    source_ids: list[str] = Field(min_length=1, max_length=20)


class Topic(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    difficulty: Literal["facil", "media", "dificil"]
    objectives: list[LearningObjective] = Field(min_length=1, max_length=10)


class EngineConfiguration(StrictModel):
    # No motor existe todavía: no se aceptan actividades o código.
    status: Literal["not_integrated"] = "not_integrated"
    capability_version: None = None
    narrative: None = None
    activities: list[None] = Field(default_factory=list, max_length=0)


class EducationPackage(StrictModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    title: str = Field(min_length=1, max_length=120)
    preferences: Preferences
    level_basis: Literal["user", "unknown"]
    curriculum_alignment: Literal["not_verified"] = "not_verified"
    topics: list[Topic] = Field(min_length=1, max_length=20)
    sources: list[Source] = Field(min_length=1, max_length=100)
    engine: EngineConfiguration = Field(default_factory=EngineConfiguration)
    preparation_mode: Literal["local", "openai"]
    warnings: list[str] = Field(default_factory=list, max_length=10)


class MessageInput(StrictModel):
    message: str = Field(min_length=1, max_length=2000)


class AgentReply(StrictModel):
    reply: str = Field(min_length=1, max_length=3000)
    preferences: Preferences


class AgentPlan(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    topics: list[Topic] = Field(min_length=1, max_length=20)


def validate_references(package: EducationPackage) -> EducationPackage:
    ids = {s.id for s in package.sources}
    if len(ids) != len(package.sources):
        raise ValueError("Referencias duplicadas")
    for topic in package.topics:
        for objective in topic.objectives:
            if not set(objective.source_ids).issubset(ids):
                raise ValueError("Referencia a una fuente inexistente")
    return package
