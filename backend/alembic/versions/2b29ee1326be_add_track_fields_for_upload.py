"""add_track_fields_for_upload

Revision ID: 2b29ee1326be
Revises: 21aa5c90bcc5
Create Date: 2025-06-21 00:31:20.112510

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b29ee1326be'
down_revision: Union[str, Sequence[str], None] = '21aa5c90bcc5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("tracks", schema=None) as batch_op:
        batch_op.add_column(sa.Column('uuid', sa.String(), nullable=False, server_default='temporary_will_be_overwritten_by_model')) # Model default handles generation
        batch_op.create_unique_constraint('uq_tracks_uuid', ['uuid'])
        batch_op.add_column(sa.Column('original_path', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('cover_filename', sa.String(), nullable=True))
        batch_op.alter_column('hls_root', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("tracks", schema=None) as batch_op:
        batch_op.drop_constraint('uq_tracks_uuid', type_='unique')
        batch_op.drop_column('uuid')
        batch_op.drop_column('cover_filename')
        batch_op.drop_column('original_path')
        batch_op.alter_column('hls_root', existing_type=sa.String(), nullable=False)
