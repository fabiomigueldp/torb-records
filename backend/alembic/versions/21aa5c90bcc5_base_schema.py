"""base schema

Revision ID: 21aa5c90bcc5
Revises:
Create Date: 2025-06-19 09:29:34.256109

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21aa5c90bcc5'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('user_preferences',
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('theme', sa.String(), nullable=True),
        sa.Column('muted_uploaders', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('username')
    )

    op.create_table('tracks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('uploader', sa.String(), nullable=False),
        sa.Column('cover_path', sa.String(), nullable=True), # This was the original field name
        sa.Column('hls_root', sa.String(), nullable=False), # This was nullable=False initially
        sa.Column('status', sa.String(), nullable=True, server_default="processing"), # Model default handled by app
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('playlists',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('owner', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('is_shared', sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('playlist_tracks',
        sa.Column('playlist_id', sa.Integer(), nullable=False),
        sa.Column('track_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['playlist_id'], ['playlists.id'], ),
        sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], ),
        sa.PrimaryKeyConstraint('playlist_id', 'track_id')
    )

    op.create_table('chats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('sender', sa.String(), nullable=False),
        sa.Column('target', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('removal_requests',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('track_id', sa.Integer(), nullable=False),
        sa.Column('requester', sa.String(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default="pending"), # Model default
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['track_id'], ['tracks.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('removal_requests')
    op.drop_table('chats')
    op.drop_table('playlist_tracks')
    op.drop_table('playlists')
    op.drop_table('tracks')
    op.drop_table('user_preferences')
