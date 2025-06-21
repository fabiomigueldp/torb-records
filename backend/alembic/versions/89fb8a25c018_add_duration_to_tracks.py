"""add_duration_to_tracks

Revision ID: 89fb8a25c018
Revises: 2b29ee1326be
Create Date: 2025-06-21 06:44:12.287686

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '89fb8a25c018'
down_revision: Union[str, Sequence[str], None] = '2b29ee1326be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("tracks", schema=None) as batch_op:
        batch_op.add_column(sa.Column('duration', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("tracks", schema=None) as batch_op:
        batch_op.drop_column('duration')
