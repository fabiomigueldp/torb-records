import datetime
from sqlalchemy import create_engine, Column, Integer, String, JSON, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func

Base = declarative_base()

class UserPreference(Base):
    __tablename__ = "user_preferences"
    username = Column(String, primary_key=True)
    theme = Column(String, default="system")
    muted_uploaders = Column(JSON, default=[])

import uuid # Add this import

class Track(Base):
    __tablename__ = "tracks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    # Add a UUID field for unique identification in file paths
    uuid = Column(String, default=lambda: str(uuid.uuid4()), unique=True, nullable=False)
    title = Column(String, nullable=False)
    uploader = Column(String, nullable=False) # Should this be a ForeignKey to a User table? For now, String.
    original_path = Column(String, nullable=True) # Path to the original uploaded file, explicitly nullable
    cover_filename = Column(String, nullable=True) # e.g., cover.jpg, explicitly nullable
    hls_root = Column(String, nullable=True) # Path to master.m3u8, initially null, explicitly nullable
    status = Column(String, default="processing") # e.g., processing, ready, error
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Playlist(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, autoincrement=True) # Changed to autoincrement as per common practice
    owner = Column(String, nullable=False) # Should this be a ForeignKey to a User table? For now, String.
    name = Column(String, nullable=False)
    is_shared = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    tracks = relationship("PlaylistTrack", back_populates="playlist", cascade="all, delete-orphan")

class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"
    playlist_id = Column(Integer, ForeignKey("playlists.id"), primary_key=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), primary_key=True)
    position = Column(Integer, nullable=False)
    playlist = relationship("Playlist", back_populates="tracks")
    track = relationship("Track") # No back_populates needed if Track doesn't need to know about Playlists

class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sender = Column(String, nullable=False) # ForeignKey to User?
    target = Column(String, nullable=True) # ForeignKey to User? Nullable for group/system messages?
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class RemovalRequest(Base):
    __tablename__ = "removal_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    requester = Column(String, nullable=False) # ForeignKey to User?
    reason = Column(Text, nullable=True)
    status = Column(String, default="pending") # e.g., pending, approved, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    track = relationship("Track")

# Placeholder for metadata used by Alembic in env.py
metadata = Base.metadata
