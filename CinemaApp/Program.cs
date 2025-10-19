using System;
using System.Threading.Tasks;
using Npgsql;

class Program
{
    static async Task Main(string[] args)
    {
        const string connectionString = "Server=localhost;Port=5433;UserId=postgres;Password=1145;Database=postgres;";

        Console.WriteLine("Спроба підключитися до бази даних...");

        try
        {
            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            Console.WriteLine($"Підключення успішне! Поточна база: {conn.Database}");

            const string checkTableSql = @"
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'movies';
            ";

            await using (var checkCmd = new NpgsqlCommand(checkTableSql, conn))
            await using (var checkReader = await checkCmd.ExecuteReaderAsync())
            {
                if (!checkReader.HasRows)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("Таблиця 'public.movies' не знайдена у базі!");
                    Console.ResetColor();
                    return;
                }
            }
            
            const string sql = @"SELECT title, release_year, duration_minutes FROM public.movies;";
            await using var cmd = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            if (!reader.HasRows)
            {
                Console.WriteLine("У таблиці 'Movies' немає жодного фільму.");
            }
            else
            {
                Console.WriteLine("\n--- Список фільмів ---");
                while (await reader.ReadAsync())
                {
                    string title = reader.IsDBNull(0) ? "(null)" : reader.GetString(0);
                    string releaseYear = reader.IsDBNull(1) ? "N/A" : reader.GetInt32(1).ToString();
                    string duration = reader.IsDBNull(2) ? "N/A" : reader.GetInt32(2).ToString();

                    Console.WriteLine($"Назва: {title}, Рік: {releaseYear}, Тривалість: {duration} хв.");
                }
                Console.WriteLine("---------------------");
            }
        }
        catch (NpgsqlException ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("Помилка PostgreSQL:");
            Console.WriteLine(ex.ToString());
            Console.ResetColor();
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("Загальна помилка:");
            Console.WriteLine(ex.ToString());
            Console.ResetColor();
        }

        Console.WriteLine("\nНатисніть будь-яку клавішу для виходу.");
        Console.ReadKey();
    }
}
