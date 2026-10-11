import sys
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from data_layer.db.load_to_supabase import load_via_postgres, main


def init_and_load_db(facilities_df=None, feat_df=None, sim_df=None, edges_data=None):
    import os

    db_url = os.getenv("SUPABASE_URL")
    if db_url and "YOUR_PASSWORD" not in db_url:
        load_via_postgres(
            db_url=db_url, facilities_df=facilities_df, feat_df=feat_df, sim_df=sim_df, edges_data=edges_data
        )
    else:
        main()


if __name__ == "__main__":
    init_and_load_db()
